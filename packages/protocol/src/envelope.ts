import { COMPACT_SESSION_FORMAT, compactReplaySession, expandCompactReplaySession, isCompactReplaySessionV1 } from "./compact";
import { COMPRESSION_ALGORITHM, type CompressionOptions, compressJson, decompressJson } from "./compression";
import { CRYPTO_ALGORITHM, type CryptoMetadata, decryptBytes, encryptBytes, KDF_ALGORITHM, KEY_LENGTH } from "./crypto";
import { base64UrlToBytes, bytesToBase64Url, decodeJsonBase64Url, encodeJsonBase64Url } from "./encoding";
import { isReplaySession, type ReplaySession } from "./events";

export const PAYLOAD_PREFIX = "osr1:" as const;
const COMPACT_ENVELOPE_MARKER = "2.";
export type EncodedReplayPayload = `${typeof PAYLOAD_PREFIX}${string}`;

export interface ReplayEnvelope {
  version: 1;
  createdAt: string;
  sdk?: { name: string; version: string } | undefined;
  app?: { id?: string | undefined; url?: string | undefined } | undefined;
  session: { id: string };
  crypto: CryptoMetadata;
  compression: {
    algorithm: typeof COMPRESSION_ALGORITHM;
    originalBytes: number;
    compressedBytes: number;
    level?: number | undefined;
  };
  stats: ReplaySession["stats"];
  payloadFormat: typeof COMPACT_SESSION_FORMAT;
  payload: string;
}

interface CompactReplayEnvelopeV2 {
  /** Public replay envelope version. */
  v: 1;
  /** Created-at ISO timestamp. */
  t: string;
  /** SDK version. SDK name is fixed to @open-session/sdk. */
  d?: string | undefined;
  /** App id/url. */
  a?: { i?: string | undefined; u?: string | undefined } | undefined;
  /** Session id. */
  s: string;
  /** Crypto: salt, iv, iterations. Algorithms/key length are fixed defaults. */
  k: [salt: string, iv: string, iterations: number];
  /** Compression: original bytes, compressed bytes, level. Algorithm is fixed. */
  z: [originalBytes: number, compressedBytes: number, level?: number | undefined];
  /** Stats: event, dropped, truncated, redaction counts. */
  x: [eventCount: number, droppedEvents: number, truncatedEvents: number, redactionCount: number];
}

export interface DecodedReplayPayload {
  envelope: ReplayEnvelope;
  session: ReplaySession;
}

export interface EncodeReplayPayloadOptions {
  compression?: CompressionOptions | undefined;
}

function compactEnvelope(envelope: ReplayEnvelope): CompactReplayEnvelopeV2 {
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

function expandCompactEnvelope(compact: CompactReplayEnvelopeV2, payload: string): ReplayEnvelope {
  return {
    version: compact.v,
    createdAt: compact.t,
    sdk: compact.d ? { name: "@open-session/sdk", version: compact.d } : undefined,
    app: compact.a ? { id: compact.a.i, url: compact.a.u } : undefined,
    session: { id: compact.s },
    crypto: {
      algorithm: CRYPTO_ALGORITHM,
      kdf: KDF_ALGORITHM,
      salt: compact.k[0],
      iv: compact.k[1],
      iterations: compact.k[2],
      keyLength: KEY_LENGTH,
    },
    compression: {
      algorithm: COMPRESSION_ALGORITHM,
      originalBytes: compact.z[0],
      compressedBytes: compact.z[1],
      level: compact.z[2],
    },
    stats: {
      eventCount: compact.x[0],
      droppedEvents: compact.x[1],
      truncatedEvents: compact.x[2],
      redactionCount: compact.x[3],
    },
    payloadFormat: COMPACT_SESSION_FORMAT,
    payload,
  };
}

function encodeCompactEnvelope(envelope: ReplayEnvelope): EncodedReplayPayload {
  return `${PAYLOAD_PREFIX}${COMPACT_ENVELOPE_MARKER}${encodeJsonBase64Url(compactEnvelope(envelope))}.${envelope.payload}`;
}

function parseCompactEnvelopeV2(encodedBody: string): ReplayEnvelope {
  const [metadata, payload, ...rest] = encodedBody.slice(COMPACT_ENVELOPE_MARKER.length).split(".");
  if (!metadata || !payload || rest.length > 0) throw new Error("Malformed osr1 compact payload");
  return expandCompactEnvelope(decodeJsonBase64Url<CompactReplayEnvelopeV2>(metadata), payload);
}

export async function encodeReplayPayload(
  session: ReplaySession,
  passphrase: string,
  options: EncodeReplayPayloadOptions = {},
): Promise<EncodedReplayPayload> {
  if (!passphrase) throw new Error("A passphrase is required because replay encryption is default-on");
  const compressed = await compressJson(compactReplaySession(session), options.compression);
  const encrypted = await encryptBytes(compressed.bytes, passphrase);
  const app = Object.fromEntries(
    Object.entries({
      id: session.metadata.appId,
      url: session.metadata.url,
    }).filter(([, value]) => value !== undefined),
  ) as NonNullable<ReplayEnvelope["app"]>;
  const envelope: ReplayEnvelope = {
    version: 1,
    createdAt: new Date().toISOString(),
    sdk: { name: "@open-session/sdk", version: session.metadata.sdkVersion },
    app,
    session: { id: session.metadata.sessionId },
    crypto: encrypted.metadata,
    compression: {
      algorithm: compressed.algorithm,
      originalBytes: compressed.originalBytes,
      compressedBytes: compressed.compressedBytes,
      level: compressed.level,
    },
    stats: session.stats,
    payloadFormat: COMPACT_SESSION_FORMAT,
    payload: bytesToBase64Url(encrypted.ciphertext),
  };
  return encodeCompactEnvelope(envelope);
}

export function parseEnvelope(encoded: string): ReplayEnvelope {
  if (!encoded.startsWith(PAYLOAD_PREFIX)) throw new Error("Payload must start with osr1:");
  const encodedBody = encoded.slice(PAYLOAD_PREFIX.length);
  if (!encodedBody.startsWith(COMPACT_ENVELOPE_MARKER)) {
    throw new Error("Unsupported osr1 payload format. Expected osr1:2.");
  }
  const envelope = parseCompactEnvelopeV2(encodedBody);
  if (envelope.version !== 1) throw new Error(`Unsupported payload version: ${String(envelope.version)}`);
  if (!envelope.crypto?.algorithm || !envelope.crypto.iv || !envelope.crypto.salt) {
    throw new Error("Payload is missing required crypto metadata");
  }
  if (envelope.compression?.algorithm !== COMPRESSION_ALGORITHM) {
    throw new Error(`Unsupported compression algorithm: ${envelope.compression?.algorithm}`);
  }
  if (!envelope.payload) throw new Error("Payload is missing encrypted bytes");
  return envelope;
}

export async function decodeReplayPayload(encoded: string, passphrase: string): Promise<DecodedReplayPayload> {
  const envelope = parseEnvelope(encoded);
  const compressedBytes = await decryptBytes(base64UrlToBytes(envelope.payload), passphrase, envelope.crypto);
  const decodedBody = await decompressJson<unknown>(compressedBytes);
  if (!isCompactReplaySessionV1(decodedBody)) throw new Error("Decoded payload body is not compact-session-v1");
  const session = expandCompactReplaySession(decodedBody);
  if (!isReplaySession(session)) throw new Error("Decoded payload is not a valid replay session");
  return { envelope, session };
}
