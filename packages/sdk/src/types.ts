import type {
  ConsoleReplayEvent,
  EncodedReplayPayload,
  NetworkReplayEvent,
  ReplayEvent,
  ReplaySession,
  ReplaySessionMetadata,
} from "@open-session/protocol";
import type { RedactionOptions } from "./privacy/redact";

export type ConsoleCaptureLevel = ConsoleReplayEvent["level"];

export interface ReplayCaptureOptions {
  clicks?: boolean;
  keydown?: boolean;
  network?: boolean;
  navigation?: boolean;
  console?: boolean;
  errors?: boolean;
}

export type ReplayBeforeSendHook = (session: ReplaySession) => ReplaySession | null | undefined | Promise<ReplaySession | null | undefined>;

export type ReplayTransport = (payload: EncodedReplayPayload) => void | Promise<void>;

export interface ReplayDebugLogger {
  debug?: (message: string, details?: Record<string, unknown>) => void;
  info?: (message: string, details?: Record<string, unknown>) => void;
  warn?: (message: string, details?: Record<string, unknown>) => void;
  error?: (message: string, details?: Record<string, unknown>) => void;
}

export interface ReplayInitOptions extends RedactionOptions {
  appId?: string;
  sessionId?: string;
  userId?: string;
  passphrase: string;
  transport?: ReplayTransport;
  /**
   * Last synchronous/asynchronous policy gate before encoding and transport.
   * Return a ReplaySession to continue, or null to drop the flush payload.
   */
  beforeSend?: ReplayBeforeSendHook;
  /**
   * Session-level sampling rate for automatic and manual replay events.
   * 1 keeps every session, 0 keeps none, and values between 0 and 1 sample by
   * Math.random() at init time.
   */
  sampleRate?: number;
  maxEvents?: number;
  maxApproxBytes?: number;
  /**
   * Compression level for the encrypted replay payload. Defaults to 6 to
   * balance payload size and flush CPU cost.
   */
  compressionLevel?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
  /**
   * Where expensive flush work runs. `main-thread` is the compatibility
   * default. `auto` uses `createFlushWorker` when provided and falls back;
   * `worker` fails if the worker path is unavailable.
   */
  processing?: "main-thread" | "auto" | "worker";
  /**
   * Advanced override for bundlers/CSP policies that need a custom worker URL.
   */
  createFlushWorker?: () => Worker;
  /**
   * Console levels to capture when capture.console is enabled. Defaults to all
   * supported console levels.
   */
  consoleLevels?: ConsoleCaptureLevel[];
  /**
   * Return false to drop a captured network event after URL redaction and before
   * it is added to the replay buffer.
   */
  networkStatusFilter?: (status: number | undefined, event: NetworkReplayEvent) => boolean;
  /**
   * Opt-in SDK diagnostics. `true` writes redaction-safe messages to console.
   * Pass a logger object to route diagnostics into your own logging surface.
   */
  debug?: boolean | ReplayDebugLogger;
  /**
   * Drop DOM interactions from matching elements before serialization.
   * Use this for widgets or regions that should never appear in replay data.
   */
  excludeSelectors?: string[];
  capture?: ReplayCaptureOptions;
}

export interface FlushResult {
  ok: boolean;
  payload?: EncodedReplayPayload;
  error?: Error;
}

export interface ReplayClient {
  addEvent(event: ReplayEvent): void;
  captureError(error: unknown, info?: { componentStack?: string } | string): void;
  flush(reason?: string): Promise<FlushResult>;
  shutdown(): void;
  metadata: ReplaySessionMetadata;
}
