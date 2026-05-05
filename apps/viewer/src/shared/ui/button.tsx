import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "../lib/cx";

type ButtonVariant = "primary" | "secondary" | "dark" | "filter";

const buttonVariants: Record<ButtonVariant, string> = {
  primary: "justify-center rounded-xl bg-indigo-600 px-4 py-2.5 text-sm text-white shadow-sm hover:bg-indigo-500",
  secondary:
    "rounded-xl border border-slate-300 bg-white/90 px-3 py-2 text-sm text-slate-700 shadow-sm hover:border-indigo-200 hover:text-indigo-700",
  dark: "rounded-lg bg-slate-900 px-3 py-1.5 text-xs text-white hover:bg-slate-700",
  filter:
    "rounded-full px-3 py-1.5 text-xs capitalize data-[active=true]:bg-indigo-600 data-[active=true]:text-white data-[active=true]:shadow-sm data-[active=false]:border data-[active=false]:border-slate-200 data-[active=false]:bg-white data-[active=false]:text-slate-600 data-[active=false]:hover:border-indigo-200 data-[active=false]:hover:text-indigo-700",
};

export function Button({
  children,
  className,
  variant = "secondary",
  active,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: ButtonVariant;
  active?: boolean;
}) {
  return (
    <button
      type={type}
      className={cx("inline-flex cursor-pointer items-center gap-2 font-bold transition duration-200", buttonVariants[variant], className)}
      data-active={active}
      {...props}
    >
      {children}
    </button>
  );
}
