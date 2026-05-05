import type { ReplayBuffer } from "../buffer";
import type { EventIdFactory } from "../event-id";
import { currentRedactedUrl } from "../privacy/redact";
import type { ReplayInitOptions } from "../types";

type NavigationType = "pushState" | "replaceState" | "popstate" | "hashchange";

function recordNavigationEvent(
  buffer: ReplayBuffer,
  options: ReplayInitOptions,
  createEventId: EventIdFactory,
  navigationType: NavigationType,
  fromUrl: string | undefined,
): void {
  try {
    const toUrl = currentRedactedUrl(options);
    if (!toUrl || toUrl === fromUrl) return;
    buffer.add({
      id: createEventId(),
      kind: "navigation",
      navigationType,
      fromUrl,
      toUrl,
      pageUrl: toUrl,
      timestamp: Date.now(),
    });
  } catch {
    // Navigation capture must never affect host routing.
  }
}

export function installNavigationCapture(buffer: ReplayBuffer, options: ReplayInitOptions, createEventId: EventIdFactory): () => void {
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;
  let lastUrl = currentRedactedUrl(options);

  const recordFromLastUrl = (navigationType: NavigationType) => {
    const fromUrl = lastUrl;
    recordNavigationEvent(buffer, options, createEventId, navigationType, fromUrl);
    lastUrl = currentRedactedUrl(options);
  };

  history.pushState = function patchedPushState(this: History, ...args: Parameters<History["pushState"]>) {
    const fromUrl = currentRedactedUrl(options);
    const result = originalPushState.apply(this, args);
    recordNavigationEvent(buffer, options, createEventId, "pushState", fromUrl);
    lastUrl = currentRedactedUrl(options);
    return result;
  } as History["pushState"];

  history.replaceState = function patchedReplaceState(this: History, ...args: Parameters<History["replaceState"]>) {
    const fromUrl = currentRedactedUrl(options);
    const result = originalReplaceState.apply(this, args);
    recordNavigationEvent(buffer, options, createEventId, "replaceState", fromUrl);
    lastUrl = currentRedactedUrl(options);
    return result;
  } as History["replaceState"];

  const popstateHandler = () => recordFromLastUrl("popstate");
  const hashchangeHandler = () => recordFromLastUrl("hashchange");

  window.addEventListener("popstate", popstateHandler);
  window.addEventListener("hashchange", hashchangeHandler);

  return () => {
    history.pushState = originalPushState;
    history.replaceState = originalReplaceState;
    window.removeEventListener("popstate", popstateHandler);
    window.removeEventListener("hashchange", hashchangeHandler);
  };
}
