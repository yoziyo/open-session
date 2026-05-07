import type { ReactNode } from "react";
import { cx } from "../lib/cx";
import type { EventTone } from "../types/tone";
import { Badge } from "./badge";

const toneBars: Record<EventTone, string> = {
  blue: "bg-sky-500",
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-rose-500",
  violet: "bg-violet-500",
  slate: "bg-slate-400",
};

export function EmptyList({ label }: { label: string }) {
  return <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">{label}</div>;
}

export function EmptyStateCard({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm">
      <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-indigo-600">
        {icon}
      </div>
      <h2 className="text-lg font-bold text-slate-950">{title}</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600">{children}</p>
    </div>
  );
}

export function JsonDetails({
  summary,
  value,
  className,
  preClassName,
  defaultOpen = false,
}: {
  summary: string;
  value: unknown;
  className?: string;
  preClassName?: string;
  defaultOpen?: boolean;
}) {
  return (
    <details open={defaultOpen} className={cx("min-w-0 max-w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-50", className)}>
      <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-slate-600 transition hover:text-slate-950">{summary}</summary>
      <pre
        className={cx(
          "max-h-72 max-w-full overflow-auto whitespace-pre-wrap break-words border-t border-slate-200 p-3 text-xs leading-relaxed text-slate-700",
          preClassName,
        )}
      >
        {typeof value === "string" ? value : JSON.stringify(value, null, 2)}
      </pre>
    </details>
  );
}

export function DetailRow({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div className="flex min-w-0 justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className="min-w-0 break-words text-right font-semibold text-slate-900">{value}</dd>
    </div>
  );
}

export function ChartBar({
  value,
  max,
  tone = "blue",
  trackClassName = "bg-slate-100",
  minWidth = 8,
}: {
  value: number;
  max: number;
  tone?: EventTone;
  trackClassName?: string;
  minWidth?: number;
}) {
  return (
    <div className={cx("h-2 overflow-hidden rounded-full", trackClassName)}>
      <div
        className={cx("h-full rounded-full", toneBars[tone])}
        style={{
          width: `${value ? Math.max(minWidth, (value / max) * 100) : 0}%`,
        }}
      />
    </div>
  );
}

export function ChartRow({ label, meta, value, max, tone }: { label: ReactNode; meta?: ReactNode; value: number; max: number; tone: EventTone }) {
  return (
    <div className="grid min-w-0 gap-1.5">
      <div className="flex min-w-0 items-center justify-between gap-3 text-xs">
        <span className="min-w-0 truncate font-semibold text-slate-700">{label}</span>
        {meta ? <span className="shrink-0 font-mono text-slate-500">{meta}</span> : null}
      </div>
      <ChartBar value={value} max={max} tone={tone} minWidth={6} />
    </div>
  );
}

export function IndicatorCard({ label, detail, value, tone, max }: { label: string; detail: string; value: number; tone: EventTone; max: number }) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-slate-600">{label}</p>
          <p className="mt-0.5 truncate text-[11px] text-slate-500">{detail}</p>
        </div>
        <Badge tone={tone}>{value}</Badge>
      </div>
      <ChartBar value={value} max={max} tone={tone} trackClassName="bg-white" />
    </div>
  );
}

export function ScrollPanel({ children, className, testId }: { children: ReactNode; className?: string; testId?: string }) {
  return (
    <div className={cx("grid max-h-[760px] gap-3 overflow-y-auto p-2 md:p-3", className)} data-testid={testId}>
      {children}
    </div>
  );
}
