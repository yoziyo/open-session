import type { ReplayCaptureOptions } from "./types";

export const OPEN_SESSION_SDK_VERSION = "0.1.0" as const;

export const DEFAULT_CAPTURE_OPTIONS: Required<ReplayCaptureOptions> = Object.freeze({
  clicks: true,
  keydown: true,
  network: true,
  navigation: true,
  console: true,
  errors: true,
});

export const DEFAULT_REPLAY_LIMITS = Object.freeze({
  maxEvents: 250,
  maxApproxBytes: 750_000,
  compressionLevel: 6,
});

export const INTERNAL_REPLAY_LIMITS = Object.freeze({
  flushWorkerTimeoutMs: 5_000,
});

export const DEFAULT_REPLAY_REDACTIONS = Object.freeze([
  "password-values",
  "sensitive-query-params",
  "authorization-headers",
  "cookies",
  "network-bodies",
] as const);

export const DEFAULT_REPLAY_PRIVACY_NOTES = Object.freeze([
  "Encryption is default-on",
  "Sensitive DOM targets are masked before serialization",
] as const);
