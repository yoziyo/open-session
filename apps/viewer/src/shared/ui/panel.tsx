import type { ReactNode } from "react";
import { cx } from "../lib/cx";

export function Panel({
  title,
  eyebrow,
  icon,
  action,
  children,
  className,
}: {
  title: string;
  eyebrow?: string;
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx("min-w-0 max-w-full overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm", className)}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          {icon ? <div className="rounded-xl border border-slate-200 bg-slate-50 p-2 text-slate-700">{icon}</div> : null}
          <div className="min-w-0">
            {eyebrow ? <p className="mb-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">{eyebrow}</p> : null}
            <h2 className="truncate text-sm font-bold tracking-[-0.01em] text-slate-950">{title}</h2>
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
