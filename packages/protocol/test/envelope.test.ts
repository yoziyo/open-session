import { afterEach, describe, expect, it, vi } from "vitest";
import { decodeReplayPayload, encodeReplayPayload, parseEnvelope, type ReplaySession } from "../src";

const session: ReplaySession = {
  metadata: {
    appId: "demo",
    sessionId: "session-1",
    sdkVersion: "0.1.0",
    url: "https://example.test",
    createdAt: "2026-04-30T00:00:00.000Z",
  },
  events: [
    {
      id: "1",
      kind: "click",
      timestamp: 1,
      target: { strategy: "id", selector: "#safe", tagName: "button" },
    },
    {
      id: "2",
      kind: "keydown",
      timestamp: 2,
      target: {
        strategy: "unknown",
        selector: "input[data-redacted]",
        redacted: true,
      },
      privacy: "masked",
    },
  ],
  errors: [],
  stats: {
    eventCount: 2,
    droppedEvents: 0,
    truncatedEvents: 0,
    redactionCount: 1,
  },
  privacy: {
    defaultRedactions: ["password-values"],
    notes: ["Encryption is default-on"],
  },
};

function normalizeGeneratedIds(value: ReplaySession): ReplaySession {
  return {
    ...value,
    events: value.events.map((event, index) => ({ ...event, id: index.toString(36) })),
    errors: value.errors.map((error) => {
      const index = value.events.findIndex((event) => event.id === error.id);
      return { ...error, id: Math.max(0, index).toString(36) };
    }),
  };
}

describe("replay envelope", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("encodes as compact osr1 v2 string and decodes with crypto/compression metadata", async () => {
    const payload = await encodeReplayPayload(session, "test-passphrase");
    expect(payload.startsWith("osr1:2.")).toBe(true);
    expect(payload.split(".")).toHaveLength(3);
    const envelope = parseEnvelope(payload);
    expect(envelope.crypto.algorithm).toBe("AES-GCM");
    expect(envelope.crypto.kdf).toBe("PBKDF2");
    expect(envelope.crypto.salt).toBeTruthy();
    expect(envelope.crypto.iv).toBeTruthy();
    expect(envelope.crypto.iterations).toBeGreaterThan(1000);
    expect(envelope.compression.algorithm).toBe("brotli");
    expect(envelope.compression.level).toBe(6);
    expect(envelope.payloadFormat).toBe("compact-session-v1");

    const decoded = await decodeReplayPayload(payload, "test-passphrase");
    expect(decoded.session).toEqual(normalizeGeneratedIds(session));
  });

  it("compacts repeated session data before compression", async () => {
    const repeatedSession: ReplaySession = {
      ...session,
      events: Array.from({ length: 40 }, (_, index) => ({
        id: index.toString(36),
        kind: "click",
        timestamp: 1000 + index,
        pageUrl: "https://example.test/repeated",
        target: {
          strategy: "class",
          selector: ".checkout-button",
          tagName: "button",
        },
      })),
      stats: { ...session.stats, eventCount: 40 },
    };
    const compact = await encodeReplayPayload(repeatedSession, "passphrase");
    const fullJsonBytes = new TextEncoder().encode(JSON.stringify(repeatedSession)).byteLength;

    expect(parseEnvelope(compact).compression.originalBytes).toBeLessThan(fullJsonBytes);
    expect((await decodeReplayPayload(compact, "passphrase")).session).toEqual(normalizeGeneratedIds(repeatedSession));
  });

  it("allows callers to lower compression level when CPU is more important", async () => {
    const payload = await encodeReplayPayload(session, "test-passphrase", {
      compression: { level: 1 },
    });

    expect(parseEnvelope(payload).compression.level).toBe(1);
    await expect(decodeReplayPayload(payload, "test-passphrase")).resolves.toMatchObject({
      session: { metadata: { sessionId: "session-1" } },
    });
  });

  it("falls back to portable crypto when SubtleCrypto is unavailable", async () => {
    const cryptoRef = globalThis.crypto;
    if (!cryptoRef?.getRandomValues) return;
    vi.stubGlobal("crypto", {
      getRandomValues: cryptoRef.getRandomValues.bind(cryptoRef),
    });

    const payload = await encodeReplayPayload(session, "test-passphrase");

    expect(parseEnvelope(payload).crypto.algorithm).toBe("AES-GCM");
    await expect(decodeReplayPayload(payload, "test-passphrase")).resolves.toMatchObject({
      session: { metadata: { sessionId: "session-1" } },
    });
  });

  it("rejects malformed payloads and wrong passphrases safely", async () => {
    expect(() => parseEnvelope("bad")).toThrow(/osr1/iu);
    expect(() => parseEnvelope("osr1:eyJ2ZXJzaW9uIjoxfQ")).toThrow(/osr1:2/iu);
    const payload = await encodeReplayPayload(session, "right");
    await expect(decodeReplayPayload(payload, "wrong")).rejects.toThrow();
  });
});
