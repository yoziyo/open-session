import type { ErrorReplayEvent, NetworkReplayEvent, ReplayEvent } from "@open-session/sdk";

export type TimelineFilter = "all" | "user" | "network" | "navigation" | "console" | "errors";

export function matchesTimelineFilter(event: ReplayEvent, filter: TimelineFilter) {
  if (filter === "all") return true;
  if (filter === "user") return event.kind === "click" || event.kind === "keydown";
  if (filter === "errors") return event.kind === "error" || event.kind === "react-error";
  return event.kind === filter;
}

export function pickFailureEvents(events: ReplayEvent[], error?: ErrorReplayEvent) {
  if (!events.length) return [];
  if (!error) return events.slice(0, 10);

  const before = events.filter((event) => event.timestamp <= error.timestamp).slice(-7);
  const after = events.filter((event) => event.timestamp > error.timestamp).slice(0, 3);
  const merged = [...before, error, ...after].filter((event, index, all) => all.findIndex((item) => item.id === event.id) === index);
  return merged.slice(-12);
}

export function isFailedNetworkEvent(event: ReplayEvent): event is NetworkReplayEvent {
  return event.kind === "network" && ((event.status ?? 200) >= 400 || event.ok === false || Boolean(event.error));
}
