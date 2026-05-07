import { cx } from "../lib/cx";

const openLogoSrc = `${import.meta.env.BASE_URL}open-session-logo.png`;

export function OpenLogoMark({ className = "h-6 w-6" }: { className?: string }) {
  return <img src={openLogoSrc} alt="Open Session" className={cx("block rounded-[22%] object-cover", className)} draggable={false} />;
}
