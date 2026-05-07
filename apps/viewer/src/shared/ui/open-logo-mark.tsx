import { cx } from "../lib/cx";

export function OpenLogoMark({ className = "h-6 w-6" }: { className?: string }) {
  return <img src="/open-session-logo.png" alt="Open Session" className={cx("block rounded-[22%] object-cover", className)} draggable={false} />;
}
