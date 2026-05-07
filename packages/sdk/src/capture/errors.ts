import type { ReplayBuffer } from "../buffer";
import { type EventIdFactory, safeRandomId } from "../event-id";
import { currentRedactedUrl, sanitizeString } from "../privacy/redact";
import type { ReplayInitOptions } from "../types";

export function errorToEvent(
  error: unknown,
  kind: "error" = "error",
  componentStack?: string,
  options: ReplayInitOptions = { passphrase: "__redaction-only__" },
  createEventId: EventIdFactory = () => safeRandomId("error"),
) {
  const redactions: string[] = [];
  const err = error instanceof Error ? error : new Error(typeof error === "string" ? error : "Unknown error");
  return {
    id: createEventId(),
    kind,
    timestamp: Date.now(),
    pageUrl: currentRedactedUrl(options),
    name: err.name,
    message: sanitizeString(err.message, redactions),
    stack: err.stack ? sanitizeString(err.stack, redactions, options.maxErrorStackLength ?? 500) : undefined,
    componentStack: componentStack ? sanitizeString(componentStack, redactions, options.maxComponentStackLength ?? 500) : undefined,
  } as const;
}

export function installErrorCapture(buffer: ReplayBuffer, options: ReplayInitOptions, createEventId: EventIdFactory): () => void {
  const onError = (event: ErrorEvent) => {
    try {
      buffer.add(errorToEvent(event.error ?? event.message, "error", undefined, options, createEventId));
    } catch {
      // ignore
    }
  };
  const onRejection = (event: PromiseRejectionEvent) => {
    try {
      buffer.add(errorToEvent(event.reason, "error", undefined, options, createEventId));
    } catch {
      // ignore
    }
  };
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
  };
}
