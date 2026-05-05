import type { ReplayBuffer } from "../buffer";
import type { EventIdFactory } from "../event-id";
import { currentRedactedUrl, matchesPattern, sanitizeUnknown } from "../privacy/redact";
import type { ConsoleCaptureLevel, ReplayInitOptions } from "../types";

const DEFAULT_LEVELS: ConsoleCaptureLevel[] = ["log", "info", "warn", "error", "debug"];

function stringifyForMatching(arg: unknown): string {
  if (typeof arg === "string") return arg;
  try {
    return JSON.stringify(arg) ?? String(arg);
  } catch {
    return String(arg);
  }
}

export function installConsoleCapture(buffer: ReplayBuffer, options: ReplayInitOptions, createEventId: EventIdFactory): () => void {
  const levels = options.consoleLevels ?? DEFAULT_LEVELS;
  const originals = new Map<ConsoleCaptureLevel, (...args: unknown[]) => void>();
  for (const level of levels) {
    originals.set(level, console[level]);
    console[level] = (...args: unknown[]) => {
      try {
        const joined = args.map(stringifyForMatching).join(" ");
        if (!matchesPattern(joined, options.excludeConsole)) {
          const redactions: string[] = [];
          const safeArgs = args.slice(0, options.maxConsoleArgs ?? 10).map((arg) => sanitizeUnknown(arg, redactions, 0, options));
          if (redactions.length) buffer.markRedaction(redactions.length);
          buffer.add({
            id: createEventId(),
            kind: "console",
            timestamp: Date.now(),
            pageUrl: currentRedactedUrl(options),
            level,
            args: safeArgs,
            redactions,
          });
        }
      } catch {
        // Do not break console behavior.
      }
      originals.get(level)?.apply(console, args);
    };
  }
  return () => {
    for (const [level, original] of originals) console[level] = original;
  };
}
