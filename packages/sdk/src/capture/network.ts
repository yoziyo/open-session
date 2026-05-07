import type { NetworkReplayEvent } from "@open-session/protocol";
import type { ReplayBuffer } from "../buffer";
import type { EventIdFactory } from "../event-id";
import { currentRedactedUrl, matchesPattern, redactUrl, sanitizeString } from "../privacy/redact";
import type { ReplayInitOptions } from "../types";

function now(): number {
  try {
    return typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
  } catch {
    return Date.now();
  }
}

function methodFromInput(input: RequestInfo | URL, init?: RequestInit): string {
  try {
    if (init?.method) return init.method.toUpperCase();
    if (typeof Request !== "undefined" && input instanceof Request) return input.method.toUpperCase();
  } catch {
    // Fall back to GET below.
  }
  return "GET";
}

function urlFromInput(input: RequestInfo | URL): string {
  try {
    if (typeof input === "string") return input;
    if (typeof URL !== "undefined" && input instanceof URL) return input.toString();
    if (input && typeof input === "object" && "url" in input && typeof input.url === "string") return input.url;
  } catch {
    // Fall back below.
  }
  return "[unknown-url]";
}

function durationSince(started: number): number {
  return Math.max(0, Math.round(now() - started));
}

function recordNetworkEvent(
  buffer: ReplayBuffer,
  options: ReplayInitOptions,
  createEventId: EventIdFactory,
  input: { rawUrl: string; method: string; started: number; status?: number; ok?: boolean; error?: unknown },
): void {
  try {
    const redacted = redactUrl(input.rawUrl, options);
    if (matchesPattern(redacted.url, options.excludeUrls)) return;
    const event: NetworkReplayEvent = {
      id: createEventId(),
      kind: "network",
      timestamp: Date.now(),
      pageUrl: currentRedactedUrl(options),
      method: input.method,
      url: redacted.url,
      status: input.status,
      durationMs: durationSince(input.started),
      ok: input.ok,
      error: input.error === undefined ? undefined : sanitizeString(input.error instanceof Error ? input.error.message : String(input.error)),
      redactions: ["headers:default", "body:default", ...redacted.redactions],
    };
    if (options.networkStatusFilter && !options.networkStatusFilter(event.status, event)) return;
    if (redacted.redactions.length) buffer.markRedaction(redacted.redactions.length);
    buffer.add(event);
  } catch {
    // Instrumentation must never affect host network behavior.
  }
}

export function installNetworkCapture(buffer: ReplayBuffer, options: ReplayInitOptions, createEventId: EventIdFactory): () => void {
  const cleanups: Array<() => void> = [];
  if (typeof fetch === "function") {
    const originalFetch = fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const started = now();
      const rawUrl = urlFromInput(input);
      const method = methodFromInput(input, init);
      try {
        const response = await originalFetch.call(globalThis, input, init);
        recordNetworkEvent(buffer, options, createEventId, {
          rawUrl,
          method,
          started,
          status: response.status,
          ok: response.ok,
        });
        return response;
      } catch (error) {
        recordNetworkEvent(buffer, options, createEventId, {
          rawUrl,
          method,
          started,
          ok: false,
          error,
        });
        throw error;
      }
    }) as typeof fetch;
    cleanups.push(() => {
      globalThis.fetch = originalFetch;
    });
  }

  if (typeof XMLHttpRequest !== "undefined") {
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;
    const patchedOpen = function patchedOpen(
      this: XMLHttpRequest,
      method: string,
      url: string | URL,
      isAsync: boolean = true,
      username?: string | null,
      password?: string | null,
    ) {
      this.__openSession = {
        method: String(method).toUpperCase(),
        url: String(url),
        started: now(),
      };
      return originalOpen.call(this, method, url, isAsync, username ?? null, password ?? null);
    } as typeof originalOpen;
    XMLHttpRequest.prototype.open = patchedOpen;
    XMLHttpRequest.prototype.send = function patchedSend(...args: Parameters<typeof originalSend>) {
      const record = () => {
        const meta = this.__openSession;
        if (!meta) return;
        recordNetworkEvent(buffer, options, createEventId, {
          rawUrl: meta.url,
          method: meta.method,
          started: meta.started,
          status: this.status,
          ok: this.status >= 200 && this.status < 400,
        });
      };
      this.addEventListener("loadend", record, { once: true });
      return originalSend.apply(this, args);
    };
    cleanups.push(() => {
      XMLHttpRequest.prototype.open = originalOpen;
      XMLHttpRequest.prototype.send = originalSend;
    });
  }

  return () => {
    for (const cleanup of cleanups) cleanup();
  };
}

declare global {
  interface XMLHttpRequest {
    __openSession?: { method: string; url: string; started: number };
  }
}
