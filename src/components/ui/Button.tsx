import { type ButtonHTMLAttributes } from "react";

const variantClasses = {
  primary: "bg-accent text-white hover:bg-accent/90 focus-visible:ring-accent disabled:opacity-50",
  ghost:
    "bg-transparent text-text hover:bg-accent-soft focus-visible:ring-accent disabled:opacity-50",
  destructive:
    "bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-600 disabled:opacity-50",
} as const;

export type ButtonVariant = keyof typeof variantClasses;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

export function Button({ variant = "primary", className = "", ...props }: ButtonProps) {
  return (
    <button
      type="button"
      className={`inline-flex h-11 min-h-11 items-center justify-center rounded-md px-4 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none ${variantClasses[variant]} ${className}`}
      {...props}
    />
  );
}
