import type { ConsoleReplayEvent, ErrorReplayEvent, NavigationReplayEvent, NetworkReplayEvent, ReplayEvent } from "@open-session/sdk";
import type { TranslationKey, TranslationValues } from "../../../shared/i18n";
import type { EventTone } from "../../../shared/types/tone";

export type ReplayTranslator = (key: TranslationKey, values?: TranslationValues) => string;

export function formatBytes(value: number | undefined): string {
  if (value === undefined) return "—";
  if (value < 1024) return `${value} B`;
  return `${(value / 1024).toFixed(value > 100 * 1024 ? 0 : 1)} KB`;
}

export function compactUrl(value: string | undefined, t?: ReplayTranslator): string {
  if (!value) return t ? t("events.unknownPage") : "Unknown page";
  try {
    const url = new URL(value);
    return `${url.hostname}${url.pathname}`;
  } catch {
    return value;
  }
}

export function isRedactedEvent(event: ReplayEvent): boolean {
  const eventJson = JSON.stringify(event);
  return eventJson.includes("[redacted]") || eventJson.includes('"redacted":true');
}

export function eventTone(event: ReplayEvent): EventTone {
  if (event.kind === "error" || event.kind === "react-error") return "red";
  if (event.kind === "network") {
    const networkEvent = event as NetworkReplayEvent;
    if (networkEvent.ok === false) return "red";
    if ((networkEvent.status ?? 200) >= 400) return "amber";
    return "blue";
  }
  if (event.kind === "console") {
    const consoleEvent = event as ConsoleReplayEvent;
    if (consoleEvent.level === "error") return "red";
    if (consoleEvent.level === "warn") return "amber";
    return "violet";
  }
  if (event.kind === "navigation") return "blue";
  if (event.kind === "keydown" || event.kind === "click") return "green";
  return "slate";
}

export function eventRepeatCount(event: ReplayEvent): number {
  const count = (event as { count?: unknown }).count;
  return typeof count === "number" && Number.isFinite(count) && count > 1 ? Math.floor(count) : 1;
}

export function eventSpanMs(event: ReplayEvent): number | undefined {
  const count = eventRepeatCount(event);
  const lastTimestamp = (event as { lastTimestamp?: unknown }).lastTimestamp;
  if (count <= 1 || typeof lastTimestamp !== "number" || !Number.isFinite(lastTimestamp)) return undefined;
  return Math.max(0, lastTimestamp - event.timestamp);
}

export function eventTitle(event: ReplayEvent, t?: ReplayTranslator): string {
  switch (event.kind) {
    case "network": {
      const item = event as NetworkReplayEvent;
      return `${item.method} ${item.status ?? "ERR"} ${compactUrl(item.url, t)}`;
    }
    case "console": {
      const item = event as ConsoleReplayEvent;
      return t ? t("events.consoleTitle", { level: item.level.toUpperCase() }) : `${item.level.toUpperCase()} console`;
    }
    case "navigation": {
      const item = event as NavigationReplayEvent;
      return t
        ? t("events.navigationTitle", { type: item.navigationType, to: compactUrl(item.toUrl, t) })
        : `${item.navigationType} ${compactUrl(item.toUrl, t)}`;
    }
    case "error":
    case "react-error": {
      const item = event as ErrorReplayEvent;
      return item.message || item.name || (t ? t("events.capturedError") : "Captured error");
    }
    case "click":
      return t ? t("events.userClick") : "User click";
    case "keydown":
      return t ? t("events.keyboardInput") : "Keyboard input";
    case "lifecycle":
      return t ? t("events.sdkLifecycle", { name: event.name }) : `SDK ${event.name}`;
    case "truncate":
      return t ? t("events.payloadTruncated", { reason: event.reason }) : `Payload truncated: ${event.reason}`;
    default:
      return t ? t("events.replayEvent") : "Replay event";
  }
}

export function eventSubtitle(event: ReplayEvent, sessionUrl?: string, t?: ReplayTranslator): string {
  if ("target" in event) return event.target.selector;
  if (event.kind === "network") return (event as NetworkReplayEvent).url;
  if (event.kind === "navigation") {
    const item = event as NavigationReplayEvent;
    return `${compactUrl(item.fromUrl, t)} → ${compactUrl(item.toUrl, t)}`;
  }
  if (event.kind === "console") {
    const args = (event as ConsoleReplayEvent).args;
    return args.length ? JSON.stringify(args).slice(0, 120) : t ? t("events.noArguments") : "No arguments";
  }
  if (event.kind === "error" || event.kind === "react-error") {
    return (event as ErrorReplayEvent).name ?? (t ? t("viewer.defaultErrorName") : "Error");
  }
  return compactUrl(event.pageUrl ?? sessionUrl, t);
}

export function formatRelativeTime(value: number): string {
  if (value === 0) return "0ms";
  const sign = value < 0 ? "-" : "+";
  const abs = Math.abs(value);
  if (abs >= 1000) return `${sign}${(abs / 1000).toFixed(1)}s`;
  return `${sign}${abs}ms`;
}
