import type { ReactNode } from "react";
import type { EventTone } from "../types/tone";
import { Badge } from "./badge";

export function MetricCard({
  label,
  value,
  detail,
  icon,
  tone = "slate",
}: {
  label: string;
  value: ReactNode;
  detail?: string;
  icon: ReactNode;
  tone?: EventTone;
}) {
  return (
    <div className="min-w-0 max-w-full rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="truncate text-xs font-medium text-slate-500">{label}</span>
        <Badge tone={tone}>{icon}</Badge>
      </div>
      <p className="truncate text-2xl font-bold tracking-[-0.04em] text-slate-950">{value}</p>
      {detail ? <p className="mt-0.5 truncate text-xs text-slate-500">{detail}</p> : null}
    </div>
  );
}
