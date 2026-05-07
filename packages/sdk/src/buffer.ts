import type {
  ClickReplayEvent,
  ConsoleReplayEvent,
  KeydownReplayEvent,
  NetworkReplayEvent,
  ReplayEvent,
  ReplayStats,
  TruncateReplayEvent,
} from "@open-session/protocol";
import { safeRandomId } from "./event-id";

export interface ReplayBufferOptions {
  maxEvents: number;
  maxApproxBytes: number;
  createEventId?: (() => string) | undefined;
}

export class ReplayBuffer {
  readonly events: ReplayEvent[] = [];
  private readonly eventSizes: number[] = [];
  droppedEvents = 0;
  truncatedEvents = 0;
  redactionCount = 0;
  private approxBytes = 0;

  constructor(private readonly options: ReplayBufferOptions) {}

  add(event: ReplayEvent): void {
    if (this.coalesceEvent(event)) return;
    const approxBytes = this.estimateEventBytes(event);
    if (approxBytes > this.options.maxApproxBytes / 2) {
      this.truncatedEvents += 1;
      this.pushEvent(this.truncationEvent("byte-limit", approxBytes));
    } else {
      this.pushEvent(event, approxBytes);
    }
    this.enforceBudget();
  }

  private coalesceEvent(event: ReplayEvent): boolean {
    return this.coalesceKeydown(event) || this.coalesceClick(event) || this.coalesceConsole(event) || this.coalesceNetwork(event);
  }

  private updateCoalescedEvent<T extends { count?: number | undefined; lastTimestamp?: number | undefined; timestamp: number }>(
    previous: T,
    incoming: { timestamp: number },
  ): void {
    const index = this.events.length - 1;
    const previousBytes = this.eventSizes[index] ?? this.estimateEventBytes(previous);
    previous.count = (previous.count ?? 1) + 1;
    previous.lastTimestamp = incoming.timestamp;
    const nextBytes = this.estimateEventBytes(previous);
    this.eventSizes[index] = nextBytes;
    this.approxBytes += nextBytes - previousBytes;
    this.enforceBudget();
  }

  private sameJson(left: unknown, right: unknown): boolean {
    try {
      return JSON.stringify(left) === JSON.stringify(right);
    } catch {
      return false;
    }
  }

  private coalesceKeydown(event: ReplayEvent): boolean {
    if (event.kind !== "keydown") return false;
    const last = this.events.at(-1);
    if (last?.kind !== "keydown") return false;

    const incoming = event as KeydownReplayEvent;
    const previous = last as KeydownReplayEvent;
    const windowMs = 1000;
    const previousTimestamp = previous.lastTimestamp ?? previous.timestamp;
    const sameInput =
      previous.privacy === incoming.privacy &&
      previous.key === incoming.key &&
      previous.code === incoming.code &&
      previous.pageUrl === incoming.pageUrl &&
      this.sameJson(previous.target, incoming.target);
    if (!sameInput || incoming.timestamp - previousTimestamp > windowMs) {
      return false;
    }

    this.updateCoalescedEvent(previous, incoming);
    return true;
  }

  private coalesceClick(event: ReplayEvent): boolean {
    if (event.kind !== "click") return false;
    const last = this.events.at(-1);
    if (last?.kind !== "click") return false;

    const incoming = event as ClickReplayEvent;
    const previous = last as ClickReplayEvent;
    const windowMs = 500;
    const previousTimestamp = previous.lastTimestamp ?? previous.timestamp;
    const sameClick = previous.button === incoming.button && previous.pageUrl === incoming.pageUrl && this.sameJson(previous.target, incoming.target);
    if (!sameClick || incoming.timestamp - previousTimestamp > windowMs) {
      return false;
    }

    this.updateCoalescedEvent(previous, incoming);
    return true;
  }

  private coalesceConsole(event: ReplayEvent): boolean {
    if (event.kind !== "console") return false;
    const last = this.events.at(-1);
    if (last?.kind !== "console") return false;

    const incoming = event as ConsoleReplayEvent;
    const previous = last as ConsoleReplayEvent;
    const windowMs = 1000;
    const previousTimestamp = previous.lastTimestamp ?? previous.timestamp;
    const sameConsole =
      previous.level === incoming.level &&
      previous.pageUrl === incoming.pageUrl &&
      this.sameJson(previous.args, incoming.args) &&
      this.sameJson(previous.redactions, incoming.redactions);
    if (!sameConsole || incoming.timestamp - previousTimestamp > windowMs) {
      return false;
    }

    this.updateCoalescedEvent(previous, incoming);
    return true;
  }

  private coalesceNetwork(event: ReplayEvent): boolean {
    if (event.kind !== "network") return false;
    const last = this.events.at(-1);
    if (last?.kind !== "network") return false;

    const incoming = event as NetworkReplayEvent;
    const previous = last as NetworkReplayEvent;
    const windowMs = 2000;
    const previousTimestamp = previous.lastTimestamp ?? previous.timestamp;
    const sameNetwork =
      previous.method === incoming.method &&
      previous.url === incoming.url &&
      previous.status === incoming.status &&
      previous.ok === incoming.ok &&
      previous.error === incoming.error &&
      previous.pageUrl === incoming.pageUrl &&
      this.sameJson(previous.redactions, incoming.redactions);
    if (!sameNetwork || incoming.timestamp - previousTimestamp > windowMs) {
      return false;
    }

    const index = this.events.length - 1;
    const previousBytes = this.eventSizes[index] ?? this.estimateEventBytes(previous);
    previous.count = (previous.count ?? 1) + 1;
    previous.lastTimestamp = incoming.timestamp;
    const durations = [previous.durationMs, previous.minDurationMs, previous.maxDurationMs, incoming.durationMs].filter(
      (value): value is number => typeof value === "number",
    );
    if (durations.length) {
      previous.minDurationMs = Math.min(...durations);
      previous.maxDurationMs = Math.max(...durations);
      previous.durationMs = incoming.durationMs;
    }
    const nextBytes = this.estimateEventBytes(previous);
    this.eventSizes[index] = nextBytes;
    this.approxBytes += nextBytes - previousBytes;
    this.enforceBudget();
    return true;
  }

  snapshot(): ReplayEvent[] {
    return [...this.events];
  }

  stats(): ReplayStats {
    return {
      eventCount: this.events.length,
      droppedEvents: this.droppedEvents,
      truncatedEvents: this.truncatedEvents,
      redactionCount: this.redactionCount,
    };
  }

  markRedaction(count = 1): void {
    this.redactionCount += count;
  }

  private truncationEvent(reason: TruncateReplayEvent["reason"], truncatedBytes: number): TruncateReplayEvent {
    return {
      id: this.options.createEventId?.() ?? safeRandomId("truncate"),
      kind: "truncate",
      timestamp: Date.now(),
      reason,
      truncatedBytes,
    };
  }

  private estimateEventBytes(event: unknown): number {
    try {
      return JSON.stringify(event).length;
    } catch {
      // Manual addEvent callers can pass non-serializable console args. Treat
      // that as over-budget so it becomes a truncation marker instead of
      // throwing through host code or keeping an unencodable object graph.
      return this.options.maxApproxBytes;
    }
  }

  private pushEvent(event: ReplayEvent, approxBytes = this.estimateEventBytes(event)) {
    this.events.push(event);
    this.eventSizes.push(approxBytes);
    this.approxBytes += approxBytes;
  }

  private retentionScore(event: ReplayEvent): number {
    switch (event.kind) {
      case "error":
      case "react-error":
        return 1000;
      case "network":
        if (event.error || event.ok === false || (typeof event.status === "number" && event.status >= 400)) return 800;
        return 300;
      case "console":
        if (event.level === "error" || event.level === "warn") return 650;
        return 250;
      case "click":
      case "keydown":
        return 550;
      case "navigation":
        return 500;
      case "truncate":
        return 200;
      case "lifecycle":
        return 100;
    }
  }

  private dropLowestPriority(): void {
    if (this.events.length === 0) return;
    let dropIndex = 0;
    let dropScore = Number.POSITIVE_INFINITY;

    this.events.forEach((event, index) => {
      const score = this.retentionScore(event);
      if (score < dropScore) {
        dropScore = score;
        dropIndex = index;
      }
    });

    const [removed] = this.events.splice(dropIndex, 1);
    const [removedBytes] = this.eventSizes.splice(dropIndex, 1);
    if (removed) {
      this.approxBytes = Math.max(0, this.approxBytes - (removedBytes ?? this.estimateEventBytes(removed)));
      this.droppedEvents += 1;
    }
  }

  private enforceBudget(): void {
    while (this.events.length > this.options.maxEvents) this.dropLowestPriority();
    while (this.events.length > 1 && this.approxBytes > this.options.maxApproxBytes) {
      this.dropLowestPriority();
    }
  }
}
