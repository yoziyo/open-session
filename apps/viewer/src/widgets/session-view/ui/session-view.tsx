import type { ConsoleReplayEvent, DecodedReplayPayload, ErrorReplayEvent, NetworkReplayEvent, ReplayEvent } from "@open-session/sdk";
import * as Tabs from "@radix-ui/react-tabs";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clipboard,
  Clock3,
  FileJson,
  Filter,
  Network,
  Route,
  ShieldCheck,
  TerminalSquare,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import {
  compactUrl,
  eventRepeatCount,
  eventSpanMs,
  eventSubtitle,
  eventTitle,
  eventTone,
  formatRelativeTime,
  isRedactedEvent,
} from "../../../entities/replay/lib/event-formatting";
import { matchesTimelineFilter, pickFailureEvents, type TimelineFilter } from "../../../entities/replay/model/timeline-filter";
import { type TranslationKey, useI18n } from "../../../shared/i18n";
import { cx } from "../../../shared/lib/cx";
import type { EventTone } from "../../../shared/types/tone";
import { Badge, Button, EmptyList, JsonDetails, MetricCard, Panel } from "../../../shared/ui";

const TAB_NAMES = ["timeline", "network", "console", "privacy", "metadata"] as const;

const TAB_LABEL_KEYS: Record<(typeof TAB_NAMES)[number], TranslationKey> = {
  timeline: "tabs.timeline",
  network: "tabs.network",
  console: "tabs.console",
  privacy: "tabs.privacy",
  metadata: "tabs.metadata",
};

const TIMELINE_FILTER_LABEL_KEYS: Record<TimelineFilter, TranslationKey> = {
  all: "timeline.filterAll",
  user: "timeline.filterUser",
  network: "timeline.filterNetwork",
  navigation: "timeline.filterNavigation",
  console: "timeline.filterConsole",
  errors: "timeline.filterErrors",
};

function eventIcon(event: ReplayEvent) {
  if (event.kind === "network") return <Network size={14} />;
  if (event.kind === "navigation") return <Route size={14} />;
  if (event.kind === "console") return <TerminalSquare size={14} />;
  if (event.kind === "error" || event.kind === "react-error") {
    return <AlertTriangle size={14} />;
  }
  if (event.kind === "click" || event.kind === "keydown") {
    return <Activity size={14} />;
  }
  return <Clock3 size={14} />;
}

function EventOccurrenceBadges({ event, showSpan = true }: { event: ReplayEvent; showSpan?: boolean }) {
  const { t } = useI18n();
  const count = eventRepeatCount(event);
  const spanMs = eventSpanMs(event);
  if (count <= 1) return null;

  return (
    <>
      <Badge tone="violet">{t("timeline.repeatBadge", { count })}</Badge>
      {showSpan && spanMs !== undefined ? <Badge tone="slate">{t("timeline.spanBadge", { duration: formatDurationMs(spanMs) })}</Badge> : null}
    </>
  );
}

function EventRow({ event, sessionUrl }: { event: ReplayEvent; sessionUrl?: string | undefined }) {
  const { t } = useI18n();
  const redacted = isRedactedEvent(event);
  const tone = eventTone(event);
  return (
    <article
      className="grid min-w-0 max-w-full gap-3 overflow-hidden rounded-xl border border-slate-200 bg-white p-3 transition duration-200 hover:border-slate-300 hover:shadow-sm md:grid-cols-[128px_minmax(0,1fr)]"
      data-testid={`event-${event.kind}`}
    >
      <div className="flex flex-wrap items-center gap-2 md:block md:space-y-2">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-700">
            {eventIcon(event)}
          </span>
          <Badge tone={tone}>{event.kind}</Badge>
        </div>
        <p className="text-xs tabular-nums text-slate-500">{new Date(event.timestamp).toLocaleTimeString()}</p>
      </div>
      <div className="min-w-0">
        <div className="mb-1.5 flex min-w-0 flex-wrap items-center gap-2">
          <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-950">{eventTitle(event, t)}</h3>
          <EventOccurrenceBadges event={event} />
          {redacted ? <Badge tone="green">{t("timeline.redacted")}</Badge> : null}
        </div>
        <p className="mb-2 truncate text-xs text-slate-500">{eventSubtitle(event, sessionUrl, t)}</p>
        <JsonDetails summary={t("timeline.rawJson")} value={event} />
      </div>
    </article>
  );
}

function FailureTimeline({
  events,
  firstError,
  sessionUrl,
  selectedEventId,
  onSelectEvent,
}: {
  events: ReplayEvent[];
  firstError?: ErrorReplayEvent | undefined;
  sessionUrl?: string | undefined;
  selectedEventId?: string | null | undefined;
  onSelectEvent: (event: ReplayEvent) => void;
}) {
  const { t } = useI18n();
  const focusEvents = pickFailureEvents(events, firstError);
  const fallbackEvent = focusEvents[0];
  if (!fallbackEvent) return <EmptyList label={t("timeline.noEventsCaptured")} />;

  const anchor = firstError?.timestamp ?? fallbackEvent.timestamp;
  const selectedEvent = focusEvents.find((event) => event.id === selectedEventId) ?? firstError ?? fallbackEvent;
  const selectedDelta = selectedEvent.timestamp - anchor;

  function selectAndFocus(event: ReplayEvent) {
    onSelectEvent(event);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const selectedPanel = document.querySelector<HTMLElement>('[data-testid="timeline-selection"]');
        selectedPanel?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        selectedPanel?.focus({ preventScroll: true });
      });
    });
  }

  return (
    <Panel title={t("timeline.panelTitle")} eyebrow={t("timeline.panelEyebrow")} icon={<Clock3 size={17} />}>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-3" data-testid="failure-timeline">
        <ol className="flex w-full min-w-0 items-stretch gap-1" aria-label={t("timeline.ariaLabel")}>
          {focusEvents.map((event, index) => {
            const delta = event.timestamp - anchor;
            const isAnchor = firstError?.id === event.id;
            const selected = selectedEvent.id === event.id;
            return (
              <li key={event.id} className="flex min-w-[148px] flex-1 items-stretch gap-1">
                <button
                  type="button"
                  className={cx(
                    "group grid w-full min-w-0 cursor-pointer grid-rows-[auto_auto_1fr] gap-2 rounded-xl border bg-white p-3 text-left transition duration-200 hover:border-indigo-300 hover:bg-indigo-50 focus-visible:ring-4 focus-visible:ring-indigo-200",
                    selected ? "border-indigo-400 bg-indigo-50 shadow-sm" : isAnchor ? "border-rose-300 bg-rose-50" : "border-slate-200",
                  )}
                  title={`${formatRelativeTime(delta)} ${eventTitle(event, t)}`}
                  aria-label={t("timeline.pointAriaLabel", { index: index + 1, kind: event.kind, title: eventTitle(event, t) })}
                  aria-pressed={selected}
                  data-testid={`timeline-point-${event.kind}`}
                  onClick={() => selectAndFocus(event)}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[11px] font-black tabular-nums text-slate-400">{String(index + 1).padStart(2, "0")}</span>
                    <span className="font-mono text-[11px] font-bold tabular-nums text-indigo-700">{formatRelativeTime(delta)}</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Badge tone={eventTone(event)}>{event.kind}</Badge>
                    <EventOccurrenceBadges event={event} showSpan={false} />
                    {isAnchor ? <Badge tone="red">{t("timeline.failureBadge")}</Badge> : null}
                  </span>
                  <span className="line-clamp-2 text-xs font-bold leading-5 text-slate-900">{eventTitle(event, t)}</span>
                </button>
                {index < focusEvents.length - 1 ? (
                  <span className="grid flex-none place-items-center text-slate-300" aria-hidden="true">
                    →
                  </span>
                ) : null}
              </li>
            );
          })}
        </ol>
      </div>

      <div
        className="mt-3 rounded-xl border border-indigo-200 bg-indigo-50 p-3 outline-none focus-visible:ring-4 focus-visible:ring-indigo-200"
        data-testid="timeline-selection"
        tabIndex={-1}
      >
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Badge tone={eventTone(selectedEvent)}>{selectedEvent.kind}</Badge>
          <EventOccurrenceBadges event={selectedEvent} />
          <span className="font-mono text-xs font-bold tabular-nums text-indigo-700">{formatRelativeTime(selectedDelta)}</span>
          <span className="text-xs text-slate-500">{new Date(selectedEvent.timestamp).toLocaleString()}</span>
        </div>
        <p className="break-words text-sm font-bold text-slate-950">{eventTitle(selectedEvent, t)}</p>
        <p className="mt-1 break-words text-xs text-slate-600">{eventSubtitle(selectedEvent, sessionUrl, t)}</p>
        <JsonDetails
          summary={t("timeline.selectedJson")}
          value={selectedEvent}
          className="mt-3 border-indigo-200 bg-white"
          preClassName="max-h-56 border-indigo-100"
          defaultOpen
        />
      </div>
    </Panel>
  );
}

function formatDurationMs(value: number | undefined): string {
  if (value === undefined) return "—";
  if (value < 1000) return `${value}ms`;
  return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)}s`;
}

function formatClockWithMs(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.toLocaleTimeString()}.${String(date.getMilliseconds()).padStart(3, "0")}`;
}

function networkStartTime(event: NetworkReplayEvent): number {
  return event.timestamp - (event.durationMs ?? 0);
}

function networkDurationLabel(event: NetworkReplayEvent, t: ReturnType<typeof useI18n>["t"]): string {
  const duration = formatDurationMs(event.durationMs);
  if (event.minDurationMs === undefined || event.maxDurationMs === undefined || event.minDurationMs === event.maxDurationMs) return duration;
  return t("network.durationRange", {
    duration,
    min: formatDurationMs(event.minDurationMs),
    max: formatDurationMs(event.maxDurationMs),
  });
}

function networkTone(event: NetworkReplayEvent): EventTone {
  if (event.ok === false || (event.status ?? 200) >= 400 || event.error) return "red";
  if ((event.status ?? 200) >= 300) return "amber";
  return "green";
}

function NetworkLatencyChart({ events, sessionStartedAt }: { events: NetworkReplayEvent[]; sessionStartedAt?: number | undefined }) {
  const { t } = useI18n();
  if (!events.length) return <EmptyList label={t("network.empty")} />;

  const sortedEvents = [...events].sort((left, right) => networkStartTime(left) - networkStartTime(right));
  const durations = sortedEvents.map((event) => event.durationMs).filter((duration): duration is number => duration !== undefined);
  const averageDuration = durations.length ? Math.round(durations.reduce((sum, duration) => sum + duration, 0) / durations.length) : undefined;
  const failedCount = sortedEvents.filter((event) => networkTone(event) === "red").length;
  const firstStart = Math.min(...sortedEvents.map(networkStartTime));
  const lastEnd = Math.max(...sortedEvents.map((event) => event.timestamp));
  const executionWindowMs = Math.max(0, lastEnd - firstStart);
  const requestOffsetBase = sessionStartedAt ?? firstStart;

  return (
    <Panel title={t("network.panelTitle")} eyebrow={t("network.panelEyebrow")} icon={<Network size={17} />}>
      <div className="grid gap-3" data-testid="network-summary">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs leading-5 text-slate-500">
            {t("network.summary", {
              count: sortedEvents.length,
              window: formatDurationMs(executionWindowMs),
              average: formatDurationMs(averageDuration),
              failed: failedCount,
            })}
          </p>
          <Badge tone="blue">{t("network.recentBadge", { count: Math.min(sortedEvents.length, 12) })}</Badge>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200" data-testid="network-detail-table">
          <div className="min-w-[960px]">
            <div className="grid grid-cols-[118px_118px_76px_minmax(260px,1fr)_92px_150px_92px] gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">
              <span>{t("network.headers.requested")}</span>
              <span>{t("network.headers.completed")}</span>
              <span>{t("network.headers.method")}</span>
              <span>{t("network.headers.url")}</span>
              <span>{t("network.headers.status")}</span>
              <span>{t("network.headers.duration")}</span>
              <span>{t("network.headers.offset")}</span>
            </div>
            <div className="divide-y divide-slate-100">
              {sortedEvents.slice(-12).map((event) => {
                const tone = networkTone(event);
                const requestedAt = networkStartTime(event);
                const offset = Math.max(0, requestedAt - requestOffsetBase);
                return (
                  <article
                    key={event.id}
                    className="grid grid-cols-[118px_118px_76px_minmax(260px,1fr)_92px_150px_92px] items-start gap-2 px-3 py-3 text-xs"
                  >
                    <span className="whitespace-nowrap font-mono tabular-nums text-slate-600">{formatClockWithMs(requestedAt)}</span>
                    <span className="whitespace-nowrap font-mono tabular-nums text-slate-500">{formatClockWithMs(event.timestamp)}</span>
                    <span className="whitespace-nowrap font-bold text-slate-700">{event.method}</span>
                    <span className="min-w-0">
                      <span className="block break-words font-semibold text-slate-950">{compactUrl(event.url)}</span>
                      {event.error ? <span className="mt-1 block break-words text-xs font-semibold text-rose-700">{event.error}</span> : null}
                    </span>
                    <span className="flex flex-wrap gap-1">
                      <Badge tone={tone}>{event.status ?? (event.error ? "ERR" : "—")}</Badge>
                      <EventOccurrenceBadges event={event} showSpan={false} />
                    </span>
                    <span className="whitespace-nowrap font-mono font-bold tabular-nums text-slate-700">{networkDurationLabel(event, t)}</span>
                    <span className="whitespace-nowrap font-mono font-bold tabular-nums text-indigo-700">+{formatDurationMs(offset)}</span>
                  </article>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </Panel>
  );
}

function formatConsoleArgs(args: unknown[]): string {
  if (!args.length) return "No arguments";
  return args
    .map((arg) => {
      if (typeof arg === "string") return arg;
      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    })
    .join(" ");
}

function ConsoleLogPanel({ events, sessionStartedAt }: { events: ConsoleReplayEvent[]; sessionStartedAt?: number | undefined }) {
  const { t } = useI18n();
  if (!events.length) return <EmptyList label={t("console.empty")} />;

  const sortedEvents = [...events].sort((left, right) => left.timestamp - right.timestamp);
  const problemCount = sortedEvents.filter((event) => event.level === "warn" || event.level === "error").length;
  const offsetBase = sessionStartedAt ?? sortedEvents[0]?.timestamp ?? 0;

  return (
    <Panel title={t("console.panelTitle")} eyebrow={t("console.panelEyebrow")} icon={<TerminalSquare size={17} />}>
      <div className="grid gap-3" data-testid="console-summary">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs leading-5 text-slate-500">{t("console.summary", { count: sortedEvents.length, problemCount })}</p>
          <Badge tone={problemCount ? "amber" : "green"}>{t("console.recentBadge", { count: Math.min(sortedEvents.length, 12) })}</Badge>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200" data-testid="console-log-table">
          <div className="grid grid-cols-[112px_80px_minmax(220px,1fr)_96px] gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-black uppercase tracking-[0.12em] text-slate-500 max-xl:hidden">
            <span>{t("console.headers.time")}</span>
            <span>{t("console.headers.level")}</span>
            <span>{t("console.headers.message")}</span>
            <span>{t("console.headers.offset")}</span>
          </div>
          <div className="divide-y divide-slate-100">
            {sortedEvents.slice(-12).map((event) => {
              const offset = Math.max(0, event.timestamp - offsetBase);
              const tone = eventTone(event);
              return (
                <article key={event.id} className="grid gap-1.5 px-3 py-2 text-xs xl:grid-cols-[112px_80px_minmax(220px,1fr)_96px] xl:items-center">
                  <span className="font-mono tabular-nums text-slate-500">{formatClockWithMs(event.timestamp)}</span>
                  <span className="flex flex-wrap gap-1">
                    <Badge tone={tone}>{event.level}</Badge>
                    <EventOccurrenceBadges event={event} showSpan={false} />
                  </span>
                  <span className="min-w-0 break-words font-semibold text-slate-950">
                    {formatConsoleArgs(event.args) || t("console.noArguments")}
                  </span>
                  <span className="font-mono font-bold tabular-nums text-indigo-700">+{formatDurationMs(offset)}</span>
                  <JsonDetails summary={t("console.jsonSummary")} value={event} className="xl:col-span-4" preClassName="max-h-48" />
                </article>
              );
            })}
          </div>
        </div>
      </div>
    </Panel>
  );
}

function VirtualizedEventStream({
  events,
  sessionUrl,
  timelineFilter,
  tabCounts,
  onFilterChange,
}: {
  events: ReplayEvent[];
  sessionUrl?: string | undefined;
  timelineFilter: TimelineFilter;
  tabCounts: Record<TimelineFilter, number>;
  onFilterChange: (filter: TimelineFilter) => void;
}) {
  const { t } = useI18n();
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: events.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 128,
    overscan: 8,
    getItemKey: (index) => events[index]?.id ?? index,
  });
  const virtualItems = virtualizer.getVirtualItems();

  function changeFilter(filter: TimelineFilter) {
    onFilterChange(filter);
    virtualizer.scrollToOffset(0);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }

  return (
    <div key={timelineFilter} ref={scrollRef} className="grid max-h-[760px] gap-3 overflow-y-auto p-2 md:p-3" data-testid="event-stream-panel">
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/95 p-3 backdrop-blur">
        <div>
          <div className="flex items-center gap-2 text-sm font-bold text-slate-950">
            <Filter size={15} /> {t("timeline.streamTitle")}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(["all", "user", "network", "navigation", "console", "errors"] as const).map((filter) => (
            <Button
              key={filter}
              variant="filter"
              active={timelineFilter === filter}
              onClick={() => changeFilter(filter)}
              aria-pressed={timelineFilter === filter}
            >
              {t(TIMELINE_FILTER_LABEL_KEYS[filter], { count: tabCounts[filter] })}
            </Button>
          ))}
        </div>
      </div>

      {events.length ? (
        <div className="relative w-full" style={{ height: `${virtualizer.getTotalSize()}px` }} data-testid="virtual-event-list">
          {virtualItems.map((virtualItem) => {
            const event = events[virtualItem.index];
            if (!event) return null;
            return (
              <div
                key={virtualItem.key}
                ref={virtualizer.measureElement}
                data-index={virtualItem.index}
                className="absolute left-0 top-0 w-full pb-3"
                style={{ transform: `translateY(${virtualItem.start}px)` }}
              >
                <EventRow event={event} sessionUrl={sessionUrl} />
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyList label={t("timeline.emptyForFilter")} />
      )}
    </div>
  );
}

export function SessionView({ decoded }: { decoded: DecodedReplayPayload }) {
  const { t } = useI18n();
  const [timelineFilter, setTimelineFilter] = useState<TimelineFilter>("all");
  const [copyState, setCopyState] = useState<"idle" | "done" | "failed">("idle");
  const [selectedTimelineEventId, setSelectedTimelineEventId] = useState<string | null>(null);

  const eventsByKind = useMemo(() => {
    const groups = new Map<string, ReplayEvent[]>();
    for (const event of decoded.session.events) {
      groups.set(event.kind, [...(groups.get(event.kind) ?? []), event]);
    }
    return groups;
  }, [decoded]);

  const filteredTimeline = useMemo(
    () => decoded.session.events.filter((event) => matchesTimelineFilter(event, timelineFilter)),
    [decoded.session.events, timelineFilter],
  );

  const firstEvent = decoded.session.events[0];
  const lastEvent = decoded.session.events.at(-1);
  const firstError = decoded.session.errors[0];
  const envelopeJson = JSON.stringify(decoded.envelope, null, 2);
  const sessionUrl = decoded.session.metadata.url;
  const durationMs = firstEvent && lastEvent ? Math.max(0, lastEvent.timestamp - firstEvent.timestamp) : 0;
  const severity = decoded.session.errors.length ? "critical" : "healthy";

  async function copyPayloadInfoJson() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard API unavailable");
      await navigator.clipboard.writeText(envelopeJson);
      setCopyState("done");
    } catch {
      setCopyState("failed");
    }
    window.setTimeout(() => setCopyState("idle"), 1500);
  }

  const tabCounts: Record<TimelineFilter, number> = {
    all: decoded.session.events.length,
    user: (eventsByKind.get("click")?.length ?? 0) + (eventsByKind.get("keydown")?.length ?? 0),
    network: eventsByKind.get("network")?.length ?? 0,
    navigation: eventsByKind.get("navigation")?.length ?? 0,
    console: eventsByKind.get("console")?.length ?? 0,
    errors: decoded.session.errors.length,
  };
  const networkEvents = (eventsByKind.get("network") ?? []) as NetworkReplayEvent[];
  const consoleEvents = (eventsByKind.get("console") ?? []) as ConsoleReplayEvent[];
  const failedNetworkCount = networkEvents.filter((event) => event.ok === false || (event.status ?? 200) >= 400).length;
  const consoleProblemCount = consoleEvents.filter((event) => event.level === "warn" || event.level === "error").length;
  const droppedSignalCount = decoded.session.stats.droppedEvents + decoded.session.stats.truncatedEvents;
  const maskedKeydownCount = decoded.session.events.filter((event) => event.kind === "keydown" && event.privacy === "masked").length;
  const redactedTargetCount = decoded.session.events.filter(
    (event) => (event.kind === "click" || event.kind === "keydown") && event.target.redacted,
  ).length;
  const redactedQueryCount = networkEvents.reduce(
    (count, event) => count + event.redactions.filter((redaction) => redaction.startsWith("query:")).length,
    0,
  );
  const protectedNetworkCount = networkEvents.filter((event) =>
    event.redactions.some((redaction) => redaction === "headers:default" || redaction === "body:default"),
  ).length;
  const consoleRedactionCount = consoleEvents.reduce((count, event) => count + event.redactions.length, 0);
  const privacyItems = [
    {
      title: t("privacy.passwordTitle"),
      value: t("privacy.passwordValue", { count: maskedKeydownCount }),
      mode: t("privacy.passwordMode"),
      detail: t("privacy.passwordDetail"),
      tone: "green" as const,
    },
    {
      title: t("privacy.networkTitle"),
      value: t("privacy.networkValue", { count: protectedNetworkCount }),
      mode: t("privacy.networkMode"),
      detail: t("privacy.networkDetail"),
      tone: "green" as const,
    },
    {
      title: t("privacy.queryTitle"),
      value: t("privacy.queryValue", { count: redactedQueryCount }),
      mode: t("privacy.queryMode"),
      detail: t("privacy.queryDetail"),
      tone: redactedQueryCount ? ("amber" as const) : ("slate" as const),
    },
    {
      title: t("privacy.domTitle"),
      value: t("privacy.domValue", { count: redactedTargetCount }),
      mode: t("privacy.domMode"),
      detail: t("privacy.domDetail"),
      tone: redactedTargetCount ? ("amber" as const) : ("slate" as const),
    },
    {
      title: t("privacy.consoleTitle"),
      value: t("privacy.consoleValue", { count: consoleRedactionCount }),
      mode: t("privacy.consoleMode"),
      detail: t("privacy.consoleDetail"),
      tone: consoleRedactionCount ? ("amber" as const) : ("slate" as const),
    },
  ];

  return (
    <div className="grid min-w-0 max-w-full gap-4" data-testid="decoded-session">
      <section className="min-w-0 max-w-full overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge tone={severity === "critical" ? "red" : "green"}>
                {severity === "critical" ? t("viewer.statusError") : t("viewer.statusNormal")}
              </Badge>
              <Badge tone="blue">{t("viewer.sessionBadge", { sessionId: decoded.session.metadata.sessionId.slice(0, 8) })}</Badge>
              <Badge tone="slate">{t("viewer.sdkBadge", { version: decoded.session.metadata.sdkVersion })}</Badge>
            </div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">{t("viewer.summaryEyebrow")}</p>
            <h2 className="mt-1 break-words text-xl font-bold tracking-[-0.03em] text-slate-950 md:text-2xl">
              {firstError ? firstError.message : t("viewer.loadedTitle")}
            </h2>
            <p className="mt-1 truncate text-sm text-slate-600">{sessionUrl ?? t("viewer.unknownPage")}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-right">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">{t("viewer.windowLabel")}</p>
            <p className="text-xs font-semibold tabular-nums text-slate-800">
              {firstEvent ? new Date(firstEvent.timestamp).toLocaleTimeString() : "—"}
              {lastEvent ? ` → ${new Date(lastEvent.timestamp).toLocaleTimeString()}` : ""}
            </p>
            <p className="text-xs text-slate-500">{t("viewer.capturedMs", { duration: durationMs })}</p>
          </div>
        </div>

        {firstError ? (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3" data-testid="error-summary">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="red">{firstError.name ?? t("viewer.defaultErrorName")}</Badge>
              <span className="text-xs font-bold uppercase tracking-[0.16em] text-rose-600">{t("viewer.mainError")}</span>
            </div>
            <p className="mt-2 break-words text-sm font-bold text-rose-900">{firstError.message}</p>
            {firstError.componentStack ? (
              <pre className="mt-3 max-h-44 max-w-full overflow-auto whitespace-pre-wrap break-words rounded-xl border border-rose-200 bg-white p-3 text-xs text-rose-900">
                {firstError.componentStack}
              </pre>
            ) : null}
          </div>
        ) : null}

        <div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <MetricCard
            label={t("viewer.metrics.errorsLabel")}
            value={decoded.session.errors.length}
            detail={t("viewer.metrics.errorsDetail")}
            icon={<AlertTriangle size={12} />}
            tone={decoded.session.errors.length ? "red" : "green"}
          />
          <MetricCard
            label={t("viewer.metrics.networkLabel")}
            value={failedNetworkCount}
            detail={t("viewer.metrics.networkDetail")}
            icon={<Network size={12} />}
            tone={failedNetworkCount ? "red" : "green"}
          />
          <MetricCard
            label={t("viewer.metrics.consoleLabel")}
            value={consoleProblemCount}
            detail={t("viewer.metrics.consoleDetail")}
            icon={<TerminalSquare size={12} />}
            tone={consoleProblemCount ? "amber" : "green"}
          />
          <MetricCard
            label={t("viewer.metrics.capturedLabel")}
            value={decoded.session.stats.eventCount}
            detail={t("viewer.metrics.capturedDetail")}
            icon={<Activity size={12} />}
            tone="blue"
          />
          <MetricCard
            label={t("viewer.metrics.droppedLabel")}
            value={droppedSignalCount}
            detail={t("viewer.metrics.droppedDetail")}
            icon={<BarChart3 size={12} />}
            tone={droppedSignalCount ? "amber" : "green"}
          />
        </div>
      </section>

      <FailureTimeline
        events={decoded.session.events}
        firstError={firstError}
        sessionUrl={sessionUrl}
        selectedEventId={selectedTimelineEventId}
        onSelectEvent={(event) => setSelectedTimelineEventId(event.id)}
      />

      <Tabs.Root defaultValue="timeline" className="min-w-0 max-w-full overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
        <Tabs.List className="flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-1">
          {TAB_NAMES.map((tab) => (
            <Tabs.Trigger
              key={tab}
              value={tab}
              className="cursor-pointer whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-bold capitalize text-slate-600 transition duration-200 hover:bg-white hover:text-slate-950 data-[state=active]:bg-white data-[state=active]:text-indigo-700 data-[state=active]:shadow-sm"
              data-testid={`tab-${tab}`}
            >
              {t(TAB_LABEL_KEYS[tab])}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        <Tabs.Content value="timeline" asChild>
          <VirtualizedEventStream
            key={timelineFilter}
            events={filteredTimeline}
            sessionUrl={sessionUrl}
            timelineFilter={timelineFilter}
            tabCounts={tabCounts}
            onFilterChange={setTimelineFilter}
          />
        </Tabs.Content>

        <Tabs.Content value="network" className="p-2 md:p-3">
          <NetworkLatencyChart events={networkEvents} sessionStartedAt={firstEvent?.timestamp} />
        </Tabs.Content>
        <Tabs.Content value="console" className="p-2 md:p-3">
          <ConsoleLogPanel events={consoleEvents} sessionStartedAt={firstEvent?.timestamp} />
        </Tabs.Content>
        <Tabs.Content value="privacy" className="p-2 md:p-3">
          <Panel title={t("privacy.panelTitle")} eyebrow={t("privacy.panelEyebrow")} icon={<ShieldCheck size={17} />}>
            <div className="grid gap-2 lg:grid-cols-2">
              {privacyItems.map((item) => (
                <div key={item.title} className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="text-emerald-600" size={15} />
                      <h3 className="text-sm font-bold text-slate-950">{item.title}</h3>
                    </div>
                    <Badge tone={item.tone}>{item.mode}</Badge>
                  </div>
                  <p className="text-lg font-black tabular-nums text-slate-950">{item.value}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-600">{item.detail}</p>
                </div>
              ))}
            </div>

            <div className="mt-3 grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 sm:grid-cols-[120px_minmax(0,1fr)]">
              <span className="font-bold text-slate-800">{t("privacy.policyLabel")}</span>
              <span>{decoded.session.privacy.defaultRedactions.join(", ")}</span>
              <span className="font-bold text-slate-800">{t("privacy.processedLabel")}</span>
              <span>{t("privacy.processedValue", { count: decoded.session.stats.redactionCount })}</span>
            </div>
          </Panel>
        </Tabs.Content>
        <Tabs.Content value="metadata" className="p-2 md:p-3">
          <Panel
            title={t("metadata.panelTitle")}
            eyebrow={t("metadata.panelEyebrow")}
            icon={<FileJson size={17} />}
            action={
              <Button variant="dark" onClick={copyPayloadInfoJson}>
                <Clipboard size={14} />
                {copyState === "done" ? t("metadata.copyDone") : copyState === "failed" ? t("metadata.copyFailed") : t("metadata.copyIdle")}
              </Button>
            }
          >
            <div data-testid="decoded-json">
              <JsonDetails summary={t("metadata.jsonSummary")} value={decoded.envelope} defaultOpen preClassName="max-h-[520px]" />
            </div>
          </Panel>
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}
