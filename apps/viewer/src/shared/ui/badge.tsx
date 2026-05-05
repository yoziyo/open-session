import type { ReactNode } from "react";
import { cx } from "../lib/cx";
import type { EventTone } from "../types/tone";

export function Badge({ children, tone = "slate" }: { children: ReactNode; tone?: EventTone }) {
  const tones: Record<EventTone, string> = {
    blue: "border-sky-200 bg-sky-50 text-sky-700",
    green: "border-emerald-200 bg-emerald-50 text-emerald-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    red: "border-rose-200 bg-rose-50 text-rose-700",
    violet: "border-violet-200 bg-violet-50 text-violet-700",
    slate: "border-slate-200 bg-slate-50 text-slate-700",
  };

  return (
    <span className={cx("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold", tones[tone])}>{children}</span>
  );
}
