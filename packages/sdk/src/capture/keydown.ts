import type { ReplayBuffer } from "../buffer";
import type { EventIdFactory } from "../event-id";
import { currentRedactedUrl, isSensitiveName } from "../privacy/redact";
import { describeTarget, isExcludedTarget } from "../privacy/selectors";
import type { ReplayInitOptions } from "../types";

function isSensitiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return false;
  return target instanceof HTMLInputElement && target.type === "password" ? true : isSensitiveName(target.name) || isSensitiveName(target.id);
}

export function installKeydownCapture(buffer: ReplayBuffer, options: ReplayInitOptions, createEventId: EventIdFactory): () => void {
  const handler = (event: KeyboardEvent) => {
    try {
      if (isExcludedTarget(event.target, options)) return;
      const sensitive = isSensitiveTarget(event.target);
      if (sensitive) buffer.markRedaction();
      buffer.add({
        id: createEventId(),
        kind: "keydown",
        timestamp: Date.now(),
        pageUrl: currentRedactedUrl(options),
        target: describeTarget(event.target, options),
        key: sensitive ? undefined : event.key.length === 1 ? "[character]" : event.key,
        code: sensitive || event.key.length === 1 ? undefined : event.code,
        privacy: sensitive ? "masked" : "safe",
      });
    } catch {
      // Capture must never affect the host app.
    }
  };
  document.addEventListener("keydown", handler, true);
  return () => document.removeEventListener("keydown", handler, true);
}
