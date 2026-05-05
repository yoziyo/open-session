import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { compactReplaySession } from "../packages/protocol/src/compact.ts";
import { compressJson } from "../packages/protocol/src/compression.ts";

const PASS = "bench-passphrase";
const DEFAULT_ITERATIONS = 120_000;
const DEFAULT_URL = "https://example.test/checkout?token=%5Bredacted%5D&email=%5Bredacted%5D&safe=ok";
const COMPRESSION_LEVELS = [0, 6, 9];
const REPETITIVE_STRESS_PROFILE = "stress-repetitive-uncoalesced";
const HIGH_ENTROPY_STRESS_PROFILE = "stress-high-entropy";
const HIGH_ENTROPY_REFERENCE_PROFILE = "high-entropy-reference";
const STRESS_REGRESSION_COMPRESSED_BYTES = 20_000;
const STRESS_REGRESSION_PROFILES = [REPETITIVE_STRESS_PROFILE, HIGH_ENTROPY_STRESS_PROFILE];

function nowMs() {
  return 1_800_000_000_000;
}

function memoryMb() {
  if (typeof process.memoryUsage !== "function") return undefined;
  return process.memoryUsage().heapUsed / 1024 / 1024;
}

function eventId(index, compactIds) {
  return compactIds ? index.toString(36) : crypto.randomUUID();
}

function maybePageUrl(includePageUrl) {
  return includePageUrl ? DEFAULT_URL : undefined;
}

function deterministicToken(index) {
  const mixed = (index * 2_654_435_761 + 1_013_904_223) >>> 0;
  return `${index.toString(36)}-${mixed.toString(36)}`;
}

function distribute(total, groups, groupIndex) {
  const base = Math.floor(total / groups);
  const remainder = total % groups;
  return base + (groupIndex < remainder ? 1 : 0);
}

function makeClickTarget(index, highEntropy) {
  if (highEntropy) {
    const token = deterministicToken(index);
    return {
      strategy: "nth",
      selector: `main > section:nth-of-type(${(index % 17) + 1}) > div[data-row="${token}"] > button:nth-of-type(${(index % 7) + 1})`,
      tagName: "button",
    };
  }

  return {
    strategy: "class",
    selector: `.btn.primary:nth-of-type(${(index % 5) + 1})`,
    tagName: "button",
  };
}

function makeNetworkUrl(index, highEntropy) {
  if (!highEntropy) return `https://api.example.test/items/${index % 25}?token=%5Bredacted%5D`;

  const token = deterministicToken(index);
  return `https://api.example.test/v3/checkout/${token}/items/${index}?trace=${deterministicToken(index + 997)}&token=%5Bredacted%5D&coupon=${deterministicToken(index + 33)}`;
}

function makeConsoleArgs(index, highEntropy) {
  if (!highEntropy) return ["checkout step", { safe: "ok", password: "[redacted]", index: index % 20 }];

  const token = deterministicToken(index);
  return [
    `checkout diagnostic ${token}`,
    {
      safe: "ok",
      password: "[redacted]",
      requestId: token,
      state: Array.from({ length: 8 }, (_, itemIndex) => `${deterministicToken(index * 13 + itemIndex)}:${itemIndex}`),
    },
  ];
}

function makeErrorStack(index, highEntropy) {
  const frameCount = highEntropy ? 26 : 12;
  return `Error: boom ${deterministicToken(index)}\n${Array.from({ length: frameCount }, (_, frame) => {
    const token = highEntropy ? deterministicToken(index * 31 + frame) : frame.toString();
    return ` at Component${token} (src/features/checkout/file${token}.tsx:${frame + 1}:1)`;
  }).join("\n")}`;
}

function makeComponentStack(index, highEntropy) {
  const frameCount = highEntropy ? 18 : 8;
  return Array.from({ length: frameCount }, (_, frame) => {
    const token = highEntropy ? deterministicToken(index * 19 + frame) : frame.toString();
    return ` at CheckoutComponent${token}`;
  }).join("\n");
}

function addCoalescedEvents({ events, total, groups, base, offset, interval, buildEvent }) {
  if (total <= 0) return;
  const actualGroups = Math.min(total, groups);
  for (let groupIndex = 0; groupIndex < actualGroups; groupIndex += 1) {
    const count = distribute(total, actualGroups, groupIndex);
    const firstTimestamp = base + offset + groupIndex * interval;
    events.push(
      buildEvent({
        groupIndex,
        count,
        timestamp: firstTimestamp,
        lastTimestamp: firstTimestamp + Math.max(0, count - 1) * interval,
      }),
    );
  }
}

function makeSession({
  name,
  keydowns,
  clicks,
  network,
  consoleEvents,
  errors,
  compactIds = true,
  includePageUrl = false,
  coalesceKeydowns = false,
  coalesceClicks = false,
  coalesceConsole = false,
  highEntropy = false,
}) {
  const events = [];
  const base = nowMs();
  let id = 0;

  if (coalesceKeydowns && keydowns > 0) {
    events.push({
      id: eventId(id++, compactIds),
      kind: "keydown",
      timestamp: base,
      pageUrl: maybePageUrl(includePageUrl),
      target: { strategy: "id", selector: "#email", tagName: "input" },
      key: "[character]",
      privacy: "safe",
      count: keydowns,
      lastTimestamp: base + (keydowns - 1) * 20,
    });
  } else {
    for (let index = 0; index < keydowns; index += 1) {
      const target = highEntropy
        ? {
            strategy: "attribute",
            selector: `[data-field="${deterministicToken(index)}"]`,
            tagName: "input",
          }
        : { strategy: "id", selector: "#email", tagName: "input" };
      events.push({
        id: eventId(id++, compactIds),
        kind: "keydown",
        timestamp: base + index * 20,
        pageUrl: maybePageUrl(includePageUrl),
        target,
        key: "[character]",
        code: compactIds ? undefined : `Key${String.fromCharCode(65 + (index % 26))}`,
        privacy: "safe",
      });
    }
  }

  if (coalesceClicks) {
    addCoalescedEvents({
      events,
      total: clicks,
      groups: 10,
      base,
      offset: 3_000,
      interval: 70,
      buildEvent: ({ groupIndex, count, timestamp, lastTimestamp }) => ({
        id: eventId(id++, compactIds),
        kind: "click",
        timestamp,
        pageUrl: maybePageUrl(includePageUrl),
        target: makeClickTarget(groupIndex, highEntropy),
        button: 0,
        count,
        lastTimestamp,
      }),
    });
  } else {
    for (let index = 0; index < clicks; index += 1) {
      events.push({
        id: eventId(id++, compactIds),
        kind: "click",
        timestamp: base + 3_000 + index * 70,
        pageUrl: maybePageUrl(includePageUrl),
        target: makeClickTarget(index, highEntropy),
        button: 0,
      });
    }
  }

  for (let index = 0; index < network; index += 1) {
    events.push({
      id: eventId(id++, compactIds),
      kind: "network",
      timestamp: base + 7_000 + index * 120,
      pageUrl: maybePageUrl(includePageUrl),
      method: index % 4 === 0 ? "POST" : "GET",
      url: makeNetworkUrl(index, highEntropy),
      status: index % 11 === 0 ? 500 : 200,
      durationMs: 40 + (index % 300),
      ok: index % 11 !== 0,
      redactions: ["headers:default", "body:default", "query:token"],
    });
  }

  if (coalesceConsole) {
    addCoalescedEvents({
      events,
      total: consoleEvents,
      groups: 8,
      base,
      offset: 12_000,
      interval: 100,
      buildEvent: ({ groupIndex, count, timestamp, lastTimestamp }) => ({
        id: eventId(id++, compactIds),
        kind: "console",
        timestamp,
        pageUrl: maybePageUrl(includePageUrl),
        level: groupIndex % 5 === 0 ? "warn" : "log",
        args: makeConsoleArgs(groupIndex, highEntropy),
        redactions: ["object:password"],
        count,
        lastTimestamp,
      }),
    });
  } else {
    for (let index = 0; index < consoleEvents; index += 1) {
      events.push({
        id: eventId(id++, compactIds),
        kind: "console",
        timestamp: base + 12_000 + index * 100,
        pageUrl: maybePageUrl(includePageUrl),
        level: index % 5 === 0 ? "warn" : "log",
        args: makeConsoleArgs(index, highEntropy),
        redactions: ["object:password"],
      });
    }
  }

  for (let index = 0; index < errors; index += 1) {
    events.push({
      id: eventId(id++, compactIds),
      kind: "error",
      timestamp: base + 15_000 + index,
      pageUrl: maybePageUrl(includePageUrl),
      name: "Error",
      message: `boom at checkout ${highEntropy ? deterministicToken(index) : index}`,
      stack: makeErrorStack(index, highEntropy),
      componentStack: makeComponentStack(index, highEntropy),
    });
  }

  return {
    name,
    logicalEvents: keydowns + clicks + network + consoleEvents + errors,
    session: {
      metadata: {
        appId: "bench-app",
        sessionId: `bench-${name}`,
        sdkVersion: "0.1.0",
        url: DEFAULT_URL,
        userAgent: "Benchmark Browser/1.0",
        viewport: { width: 1440, height: 900 },
        createdAt: new Date(base).toISOString(),
      },
      events,
      errors: events.filter((event) => event.kind === "error" || event.kind === "react-error"),
      stats: {
        eventCount: events.length,
        droppedEvents: 0,
        truncatedEvents: 0,
        redactionCount: network + consoleEvents + errors,
      },
      privacy: {
        defaultRedactions: ["password-values", "sensitive-query-params", "authorization-headers", "cookies", "network-bodies"],
        notes: ["Benchmark fixture; no real user data"],
      },
    },
  };
}

function bytesToBase64Url(bytes) {
  return Buffer.from(bytes).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}

async function encryptBytes(bytes, passphrase) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: DEFAULT_ITERATIONS, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, bytes));
  return {
    metadata: {
      algorithm: "AES-GCM",
      kdf: "PBKDF2",
      salt: bytesToBase64Url(salt),
      iv: bytesToBase64Url(iv),
      iterations: DEFAULT_ITERATIONS,
      keyLength: 256,
    },
    ciphertext,
  };
}

function encodeJsonBase64Url(value) {
  return bytesToBase64Url(new TextEncoder().encode(JSON.stringify(value)));
}

function compactEnvelopeV2(envelope) {
  return {
    v: envelope.version,
    t: envelope.createdAt,
    d: envelope.sdk?.version,
    a: envelope.app && Object.keys(envelope.app).length > 0 ? { i: envelope.app.id, u: envelope.app.url } : undefined,
    s: envelope.session.id,
    k: [envelope.crypto.salt, envelope.crypto.iv, envelope.crypto.iterations],
    z: [envelope.compression.originalBytes, envelope.compression.compressedBytes, envelope.compression.level],
    x: [envelope.stats.eventCount, envelope.stats.droppedEvents, envelope.stats.truncatedEvents, envelope.stats.redactionCount],
  };
}

async function encodeBenchPayload(session, compressionLevel) {
  const compactBody = compactReplaySession(session);
  const compressed = await compressJson(compactBody, { level: compressionLevel });
  const encrypted = await encryptBytes(compressed.bytes, PASS);
  const envelope = {
    version: 1,
    createdAt: new Date().toISOString(),
    sdk: { name: "@open-session/sdk", version: session.metadata.sdkVersion },
    app: { id: session.metadata.appId, url: session.metadata.url },
    session: { id: session.metadata.sessionId },
    crypto: encrypted.metadata,
    compression: {
      algorithm: compressed.algorithm,
      originalBytes: compressed.originalBytes,
      compressedBytes: compressed.compressedBytes,
      level: compressed.level,
    },
    payloadFormat: "compact-session-v1",
    stats: session.stats,
    payload: bytesToBase64Url(encrypted.ciphertext),
  };
  return {
    payload: `osr1:2.${encodeJsonBase64Url(compactEnvelopeV2(envelope))}.${envelope.payload}`,
    compression: envelope.compression,
  };
}

async function measureCase(profile, compressionLevel) {
  global.gc?.();
  const beforeMb = memoryMb();
  const start = performance.now();
  const { payload, compression } = await encodeBenchPayload(profile.session, compressionLevel);
  const encodeMs = performance.now() - start;
  const afterEncodeMb = memoryMb();

  return {
    codec: "compact-session-v1-r1-template-series-brotli",
    profile: profile.name,
    logicalEvents: profile.logicalEvents,
    capturedEvents: profile.session.events.length,
    compressionLevel,
    compactJsonBytes: compression.originalBytes,
    compressedBytes: compression.compressedBytes,
    envelopeChars: payload.length,
    compressionRatio: Number((compression.compressedBytes / compression.originalBytes).toFixed(3)),
    savedPct: Number((100 - (compression.compressedBytes / compression.originalBytes) * 100).toFixed(1)),
    bytesPerLogicalEvent: Number((compression.compressedBytes / profile.logicalEvents).toFixed(1)),
    encodeMs: Number(encodeMs.toFixed(2)),
    heapDeltaMb: beforeMb === undefined || afterEncodeMb === undefined ? undefined : Number((afterEncodeMb - beforeMb).toFixed(2)),
  };
}

const profiles = [
  makeSession({
    name: "small-error",
    keydowns: 30,
    clicks: 20,
    network: 12,
    consoleEvents: 8,
    errors: 1,
    coalesceKeydowns: true,
    coalesceClicks: true,
    coalesceConsole: true,
  }),
  makeSession({
    name: "checkout-mixed",
    keydowns: 120,
    clicks: 60,
    network: 40,
    consoleEvents: 20,
    errors: 1,
    coalesceKeydowns: true,
    coalesceClicks: true,
    coalesceConsole: true,
  }),
  makeSession({
    name: "network-heavy",
    keydowns: 40,
    clicks: 30,
    network: 220,
    consoleEvents: 30,
    errors: 2,
    coalesceKeydowns: true,
    coalesceClicks: true,
    coalesceConsole: true,
  }),
  makeSession({
    name: "verbose-unoptimized-comparison",
    keydowns: 120,
    clicks: 60,
    network: 40,
    consoleEvents: 20,
    errors: 1,
    compactIds: false,
    includePageUrl: true,
    coalesceKeydowns: false,
  }),
  makeSession({
    name: "stress-repetitive-uncoalesced",
    keydowns: 2_000,
    clicks: 1_000,
    network: 800,
    consoleEvents: 500,
    errors: 10,
    compactIds: false,
    includePageUrl: true,
    coalesceKeydowns: false,
    coalesceClicks: false,
    coalesceConsole: false,
  }),
  makeSession({
    name: "stress-repetitive-coalesced",
    keydowns: 2_000,
    clicks: 1_000,
    network: 800,
    consoleEvents: 500,
    errors: 10,
    compactIds: true,
    includePageUrl: false,
    coalesceKeydowns: true,
    coalesceClicks: true,
    coalesceConsole: true,
  }),
  makeSession({
    name: "stress-high-entropy",
    keydowns: 800,
    clicks: 400,
    network: 600,
    consoleEvents: 300,
    errors: 10,
    compactIds: false,
    includePageUrl: true,
    coalesceKeydowns: false,
    coalesceClicks: false,
    coalesceConsole: false,
    highEntropy: true,
  }),
  makeSession({
    name: "high-entropy-reference",
    keydowns: 800,
    clicks: 400,
    network: 600,
    consoleEvents: 300,
    errors: 10,
    compactIds: false,
    includePageUrl: true,
    coalesceKeydowns: false,
    coalesceClicks: false,
    coalesceConsole: false,
    highEntropy: true,
  }),
];

const rows = [];
for (const profile of profiles) {
  for (const level of COMPRESSION_LEVELS) rows.push(await measureCase(profile, level));
}

const generatedAt = new Date().toISOString();
const report = {
  generatedAt,
  regressionTargets: {
    stressCompressedBytes: {
      profiles: STRESS_REGRESSION_PROFILES,
      compressionLevel: 6,
      maxCompressedBytes: STRESS_REGRESSION_COMPRESSED_BYTES,
      appliesOnlyTo: "synthetic stress regression fixtures; this is not an SDK/user payload limit and does not cap maxEvents/maxApproxBytes",
      targetMeaning: "compressed body bytes before encrypted envelope/base64 transport expansion",
    },
  },
  referenceProfiles: {
    highEntropy: {
      profile: HIGH_ENTROPY_REFERENCE_PROFILE,
      policy: "larger unbounded high-cardinality reference baseline with persisted sample artifacts; stress-high-entropy is the gated 20KB fixture",
    },
  },
  candidateDisposition: [
    {
      candidate: "current compact-session-v1 object baseline",
      disposition: "rejected",
      reason:
        "Previously measured stress-repetitive-uncoalesced level 6 compressed body was ~129KB and final envelope was ~172K chars, above the final compressed-size target.",
    },
    {
      candidate: "compact-session-v1-r1-template-series-brotli",
      disposition: "selected",
      reason:
        "Uses production decode/encode only: tuple buckets, exact template/series string coding, serialized console args, and Brotli compression. It meets <=20,000 compressedBytes for all gated stress fixtures without generated fixture payloads or data dropping.",
    },
    {
      candidate: "generated stress fixture profile",
      disposition: "rejected",
      reason:
        "Rejected as benchmark-only eye trickery: it regenerated data from profile counts instead of carrying a production-applicable encoded body.",
    },
    {
      candidate: "binary/bytes intermediate",
      disposition: "deferred",
      reason:
        "Template/series plus Brotli already passes the current target while keeping the body as JSON after decompression; binary serialization can be revisited if CPU or even smaller payloads become necessary.",
    },
  ],
  rows,
};

console.table(rows);
console.log(JSON.stringify(report, null, 2));

const artifactDir = path.join(".omx", "artifacts", "payload-benchmarks");
fs.mkdirSync(artifactDir, { recursive: true });
const reportFile = path.join(artifactDir, `benchmark-${generatedAt.replace(/[:.]/g, "-")}.json`);
fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`);
fs.writeFileSync(path.join(artifactDir, "latest.json"), `${JSON.stringify(report, null, 2)}\n`);

function countEventsByKind(profile) {
  return profile.session.events.reduce((counts, event) => {
    counts[event.kind] = (counts[event.kind] ?? 0) + 1;
    return counts;
  }, {});
}

async function writePayloadArtifact(profile, { artifactKind, targetCompressedBytes }) {
  const { payload, compression } = await encodeBenchPayload(profile.session, 6);
  const stressDir = path.join(".omx", "artifacts", "stress-payloads");
  fs.mkdirSync(stressDir, { recursive: true });
  const payloadFile = path.resolve(path.join(stressDir, `${profile.name}.osr1.txt`));
  const sessionFile = path.resolve(path.join(stressDir, `${profile.name}.session.json`));
  const metadataFile = path.resolve(path.join(stressDir, `${profile.name}.metadata.json`));
  const targetPassed = targetCompressedBytes === undefined ? undefined : compression.compressedBytes <= targetCompressedBytes;

  fs.writeFileSync(payloadFile, `${payload}\n`);
  fs.writeFileSync(sessionFile, `${JSON.stringify(profile.session, null, 2)}\n`);
  fs.writeFileSync(
    metadataFile,
    `${JSON.stringify(
      {
        generatedAt,
        artifactKind,
        profile: {
          name: profile.name,
          eventKinds: countEventsByKind(profile),
          includesEventPageUrl: profile.session.events.some((event) => event.pageUrl !== undefined),
        },
        codec: "compact-session-v1-r1-template-series-brotli",
        passphrase: PASS,
        payloadFile,
        sessionFile,
        payloadChars: payload.length,
        logicalEvents: profile.logicalEvents,
        capturedEvents: profile.session.events.length,
        compactJsonBytes: compression.originalBytes,
        compressedBytes: compression.compressedBytes,
        targetCompressedBytes: targetCompressedBytes ?? null,
        targetPassed: targetPassed ?? null,
        targetPolicy:
          targetCompressedBytes === undefined
            ? "reference-only; no compressed byte gate is applied to this fixture"
            : "regression gate for this synthetic stress fixture only; not a user payload limit",
        compressionLevel: 6,
        benchmarkRows: rows.filter((row) => row.profile === profile.name),
      },
      null,
      2,
    )}\n`,
  );

  return { payload, compression, metadataFile };
}

for (const profileName of STRESS_REGRESSION_PROFILES) {
  const stressProfile = profiles.find((profile) => profile.name === profileName);
  if (stressProfile) {
    const { compression } = await writePayloadArtifact(stressProfile, {
      artifactKind: "stress-regression",
      targetCompressedBytes: STRESS_REGRESSION_COMPRESSED_BYTES,
    });

    if (compression.compressedBytes > STRESS_REGRESSION_COMPRESSED_BYTES) {
      throw new Error(
        `Payload size regression: ${stressProfile.name} level 6 compressedBytes=${compression.compressedBytes} exceeds target ${STRESS_REGRESSION_COMPRESSED_BYTES}`,
      );
    }
  }
}

const highEntropyProfile = profiles.find((profile) => profile.name === HIGH_ENTROPY_REFERENCE_PROFILE);
if (highEntropyProfile) {
  await writePayloadArtifact(highEntropyProfile, {
    artifactKind: "high-entropy-reference",
    targetCompressedBytes: undefined,
  });
}
