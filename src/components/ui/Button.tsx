import { type ButtonHTMLAttributes } from "react";

const variantClasses = {
  primary: "border border-accent text-accent hover:bg-accent-soft disabled:opacity-50",
  secondary:
    "border border-border bg-surface text-text hover:border-accent hover:text-accent disabled:opacity-50",
  soft: "border border-accent/25 bg-accent-soft/70 text-accent hover:bg-accent-soft disabled:opacity-50",
  ghost: "text-text hover:text-accent disabled:opacity-50",
  destructive:
    "border border-red-600/40 text-red-700 hover:bg-red-600/10 disabled:opacity-50",
} as const;

export type ButtonVariant = keyof typeof variantClasses;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

export function Button({ variant = "primary", className = "", ...props }: ButtonProps) {
  return (
    <button
      type="button"
      className={`inline-flex h-11 min-h-11 items-center justify-center rounded-sm px-4 text-sm font-medium uppercase tracking-[0.06em] transition-colors focus-visible:outline-none ${variantClasses[variant]} ${className}`}
      {...props}
    />
  );
}
