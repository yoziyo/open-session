import type { ReplayEvent, ReplaySession } from "@open-session/protocol";
import { ReplayBuffer } from "./buffer";
import { installClickCapture } from "./capture/click";
import { installConsoleCapture } from "./capture/console";
import { errorToEvent, installErrorCapture } from "./capture/errors";
import { installKeydownCapture } from "./capture/keydown";
import { installNavigationCapture } from "./capture/navigation";
import { installNetworkCapture } from "./capture/network";
import {
  DEFAULT_CAPTURE_OPTIONS,
  DEFAULT_REPLAY_LIMITS,
  DEFAULT_REPLAY_PRIVACY_NOTES,
  DEFAULT_REPLAY_REDACTIONS,
  OPEN_SESSION_SDK_VERSION,
} from "./constants";
import { createSessionEventIdFactory, safeRandomId } from "./event-id";
import { encodeReplaySession } from "./flush";
import { currentRedactedUrl } from "./privacy/redact";
import type { FlushResult, ReplayClient, ReplayInitOptions } from "./types";

let activeClient: ReplayClient | null = null;

function isBrowserRuntime(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function viewport() {
  if (typeof window === "undefined") return undefined;
  return { width: window.innerWidth, height: window.innerHeight };
}

function defaultCapture(options: ReplayInitOptions, key: keyof NonNullable<ReplayInitOptions["capture"]>): boolean {
  return options.capture?.[key] ?? DEFAULT_CAPTURE_OPTIONS[key];
}

function assertFiniteNumberInRange(name: string, value: number | undefined, min: number, max: number): void {
  if (value === undefined) return;
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new RangeError(`${name} must be a finite number between ${min} and ${max}`);
  }
}

function assertIntegerInRange(name: string, value: number | undefined, min: number, max = Number.MAX_SAFE_INTEGER): void {
  if (value === undefined) return;
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new RangeError(`${name} must be an integer between ${min} and ${max}`);
  }
}

function validateReplayInitOptions(options: ReplayInitOptions): void {
  assertFiniteNumberInRange("sampleRate", options.sampleRate, 0, 1);
  assertIntegerInRange("compressionLevel", options.compressionLevel, 0, 9);
  assertIntegerInRange("maxEvents", options.maxEvents, 1);
  assertIntegerInRange("maxApproxBytes", options.maxApproxBytes, 1);
  assertIntegerInRange("flushWorkerTimeoutMs", options.flushWorkerTimeoutMs, 1);
  assertIntegerInRange("keydownCoalesceWindowMs", options.keydownCoalesceWindowMs, 0);
  assertIntegerInRange("maxSanitizedStringLength", options.maxSanitizedStringLength, 1);
  assertIntegerInRange("maxConsoleArgs", options.maxConsoleArgs, 0);
  assertIntegerInRange("maxConsoleObjectKeys", options.maxConsoleObjectKeys, 0);
  assertIntegerInRange("maxConsoleArrayEntries", options.maxConsoleArrayEntries, 0);
  assertIntegerInRange("maxErrorStackLength", options.maxErrorStackLength, 1);
  assertIntegerInRange("maxComponentStackLength", options.maxComponentStackLength, 1);
}

function shouldSampleSession(options: ReplayInitOptions): boolean {
  const rate = options.sampleRate;
  if (rate === undefined) return true;
  if (rate <= 0) return false;
  if (rate >= 1) return true;
  return Math.random() < rate;
}

export function getReplayClient(): ReplayClient | null {
  return activeClient;
}

function inactiveClientError(action: string): Error {
  return new Error(`initOpenSession must be called before ${action}`);
}

export function initOpenSession(options: ReplayInitOptions): ReplayClient {
  if (activeClient) return activeClient;
  if (!options.passphrase) throw new Error("passphrase is required because encryption is default-on");
  validateReplayInitOptions(options);
  const createEventId = createSessionEventIdFactory();
  const buffer = new ReplayBuffer({
    maxEvents: options.maxEvents ?? DEFAULT_REPLAY_LIMITS.maxEvents,
    maxApproxBytes: options.maxApproxBytes ?? DEFAULT_REPLAY_LIMITS.maxApproxBytes,
    createEventId,
    keydownCoalesceWindowMs: options.keydownCoalesceWindowMs,
  });
  const cleanups: Array<() => void> = [];
  let flushInFlight: Promise<FlushResult> | null = null;
  const sampled = shouldSampleSession(options);
  const metadata = {
    appId: options.appId,
    sessionId: options.sessionId ?? safeRandomId("session"),
    userId: options.userId,
    sdkVersion: OPEN_SESSION_SDK_VERSION,
    url: currentRedactedUrl(options),
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
    viewport: viewport(),
    createdAt: new Date().toISOString(),
  };

  const safely = (install: () => () => void) => {
    try {
      cleanups.push(install());
    } catch {
      // Installation failures must not break host app.
    }
  };

  if (sampled && isBrowserRuntime() && defaultCapture(options, "clicks")) safely(() => installClickCapture(buffer, options, createEventId));
  if (sampled && isBrowserRuntime() && defaultCapture(options, "keydown")) safely(() => installKeydownCapture(buffer, options, createEventId));
  if (sampled && isBrowserRuntime() && defaultCapture(options, "network")) safely(() => installNetworkCapture(buffer, options, createEventId));
  if (sampled && isBrowserRuntime() && defaultCapture(options, "navigation")) safely(() => installNavigationCapture(buffer, options, createEventId));
  if (sampled && isBrowserRuntime() && defaultCapture(options, "console")) safely(() => installConsoleCapture(buffer, options, createEventId));
  if (sampled && isBrowserRuntime() && defaultCapture(options, "errors")) safely(() => installErrorCapture(buffer, options, createEventId));

  if (sampled) {
    buffer.add({
      id: createEventId(),
      kind: "lifecycle",
      name: "init",
      timestamp: Date.now(),
      pageUrl: metadata.url,
    });
  }

  const client: ReplayClient = {
    metadata,
    addEvent(event) {
      if (!sampled) return;
      try {
        buffer.add(event);
      } catch {
        // ignore
      }
    },
    captureError(error, info) {
      if (!sampled) return;
      try {
        const componentStack = typeof info === "string" ? info : info?.componentStack;
        buffer.add(errorToEvent(error, "error", componentStack, options, createEventId));
      } catch {
        // ignore
      }
    },
    async flush(reason = "manual"): Promise<FlushResult> {
      if (!sampled) return { ok: true };
      if (flushInFlight) return flushInFlight;
      flushInFlight = (async () => {
        try {
          buffer.add({
            id: createEventId(),
            kind: "lifecycle",
            name: "flush",
            detail: reason,
            timestamp: Date.now(),
            pageUrl: currentRedactedUrl(options),
          });
          const events = buffer.snapshot();
          const errors = events.filter((event) => event.kind === "error" || event.kind === "react-error") as ReplaySession["errors"];
          const session: ReplaySession = {
            metadata,
            events,
            errors,
            stats: buffer.stats(),
            privacy: {
              defaultRedactions: [...DEFAULT_REPLAY_REDACTIONS],
              notes: [...DEFAULT_REPLAY_PRIVACY_NOTES],
            },
          };
          const sessionToSend = options.beforeSend ? await options.beforeSend(session) : session;
          if (!sessionToSend) return { ok: true };
          const payload = await encodeReplaySession(sessionToSend, options.passphrase, options);
          await options.transport?.(payload);
          return { ok: true, payload };
        } catch (error) {
          return {
            ok: false,
            error: error instanceof Error ? error : new Error(String(error)),
          };
        } finally {
          flushInFlight = null;
        }
      })();
      return flushInFlight;
    },
    shutdown() {
      for (const cleanup of cleanups.splice(0)) {
        try {
          cleanup();
        } catch {
          // ignore
        }
      }
      if (activeClient === client) activeClient = null;
    },
  };

  activeClient = client;
  return client;
}

export function addReplayEvent(event: ReplayEvent): void {
  activeClient?.addEvent(event);
}

export function captureError(error: unknown, info?: { componentStack?: string } | string): void {
  activeClient?.captureError(error, info);
}

export function flushOpenSession(reason?: string): Promise<FlushResult> {
  if (!activeClient) {
    return Promise.resolve({ ok: false, error: inactiveClientError("flushOpenSession") });
  }
  return activeClient.flush(reason);
}

export function shutdownReplay(): void {
  activeClient?.shutdown();
  activeClient = null;
}
