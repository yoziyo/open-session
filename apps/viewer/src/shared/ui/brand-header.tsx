import type { ReactNode } from "react";
import { cx } from "../lib/cx";
import type { EventTone } from "../types/tone";
import { Badge } from "./badge";

export type BrandHeaderBadge = {
  id?: string;
  label: ReactNode;
  tone?: EventTone;
};

export function BrandHeader({
  icon,
  badges,
  titlePrefix = "Open",
  titleSuffix = "Session Viewer",
  description,
  action,
  iconFrame = "default",
  title,
}: {
  icon: ReactNode;
  badges?: BrandHeaderBadge[];
  titlePrefix?: string;
  titleSuffix?: string;
  description: ReactNode;
  action?: ReactNode;
  iconFrame?: "default" | "plain";
  title?: ReactNode;
}) {
  return (
    <header className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm md:px-5 md:py-5">
      <div className="pointer-events-none absolute right-4 top-0 h-32 w-32 rounded-full bg-indigo-100 blur-3xl" />
      <div className="relative z-10 flex min-w-0 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3 md:gap-4">
          <div
            className={cx(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl md:h-12 md:w-12",
              iconFrame === "plain" ? "bg-transparent" : "border border-slate-200 bg-slate-950 text-white shadow-sm",
            )}
          >
            {icon}
          </div>
          <div className="min-w-0">
            {badges?.length ? (
              <div className="mb-1 flex flex-wrap items-center gap-2">
                {badges.map((badge) => (
                  <Badge key={badge.id ?? String(badge.label)} {...(badge.tone ? { tone: badge.tone } : {})}>
                    {badge.label}
                  </Badge>
                ))}
              </div>
            ) : null}
            {title ?? (
              <h1 className="text-2xl font-black tracking-normal md:text-3xl lg:text-4xl">
                <span className="bg-gradient-to-r from-slate-950 via-indigo-700 to-slate-500 bg-clip-text text-transparent">{titlePrefix}</span>{" "}
                <span className="text-slate-950">{titleSuffix}</span>
              </h1>
            )}
            <p className="mt-1 max-w-4xl text-sm text-slate-600">{description}</p>
          </div>
        </div>
        {action ? <div className="ml-auto shrink-0">{action}</div> : null}
      </div>
    </header>
  );
}
