import type { ReplayBuffer } from "../buffer";
import type { EventIdFactory } from "../event-id";
import { currentRedactedUrl } from "../privacy/redact";
import { describeTarget, isExcludedTarget } from "../privacy/selectors";
import type { ReplayInitOptions } from "../types";

export function installClickCapture(buffer: ReplayBuffer, options: ReplayInitOptions, createEventId: EventIdFactory): () => void {
  const handler = (event: MouseEvent) => {
    try {
      if (isExcludedTarget(event.target, options)) return;
      buffer.add({
        id: createEventId(),
        kind: "click",
        timestamp: Date.now(),
        pageUrl: currentRedactedUrl(options),
        target: describeTarget(event.target, options),
        button: event.button,
      });
    } catch {
      // Capture must never affect the host app.
    }
  };
  document.addEventListener("click", handler, true);
  return () => document.removeEventListener("click", handler, true);
}
