import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";
import { cx } from "../lib/cx";

const controlFocus = "transition focus-within:border-indigo-500 focus-within:ring-4 focus-within:ring-indigo-100";
const inputFocus = "outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100";

export function TextareaField({ label, className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: ReactNode }) {
  return (
    <label className="grid gap-1.5 text-xs font-semibold text-slate-700">
      {label}
      <textarea
        className={cx(
          "min-h-52 resize-y rounded-xl border border-slate-300 bg-white p-3 font-mono text-xs text-slate-800 shadow-inner",
          inputFocus,
          className,
        )}
        {...props}
      />
    </label>
  );
}

export function IconInputField({
  label,
  icon,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <label className="grid gap-1.5 text-xs font-semibold text-slate-700">
      {label}
      <div className={cx("flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3", controlFocus)}>
        {icon}
        <input className={cx("min-h-10 flex-1 border-0 bg-transparent text-sm text-slate-900 outline-none", className)} {...props} />
      </div>
    </label>
  );
}

export function InlineAlert({ children, icon, testId }: { children: ReactNode; icon?: ReactNode; testId?: string }) {
  return (
    <p className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-700" data-testid={testId}>
      {icon}
      {children}
    </p>
  );
}
