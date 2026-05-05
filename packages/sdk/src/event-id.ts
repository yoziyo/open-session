export type EventIdFactory = () => string;

export function safeRandomId(prefix = "open"): string {
  try {
    const randomUUID = globalThis.crypto?.randomUUID;
    if (typeof randomUUID === "function") return randomUUID.call(globalThis.crypto);
  } catch {
    // Fall back below when crypto is unavailable or hostile.
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createSessionEventIdFactory(): EventIdFactory {
  let nextId = 0;
  return () => (nextId++).toString(36);
}
