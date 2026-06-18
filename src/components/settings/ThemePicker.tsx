"use client";

import { useActionState, useRef } from "react";
import { updateTheme, type SettingsActionState, type Theme } from "@/lib/actions/settings";

const THEMES: { id: Theme; label: string; swatches: string[] }[] = [
  {
    id: "default",
    label: "Default",
    swatches: ["#faf8f5", "#ffffff", "#c2410c", "#1c1917"],
  },
  {
    id: "warm",
    label: "Warm Earth",
    swatches: ["#efe6da", "#f7f1e8", "#a8531f", "#2b211a"],
  },
  {
    id: "dark",
    label: "Dark",
    swatches: ["#1a1816", "#24211e", "#e07a45", "#f0ece6"],
  },
  {
    id: "gamer",
    label: "Gamer",
    swatches: ["#0b0e14", "#131825", "#b026ff", "#e6f1ff"],
  },
];

export function ThemePicker({ currentTheme }: { currentTheme: Theme }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState<SettingsActionState, FormData>(
    updateTheme,
    {},
  );

  function handleChange() {
    formRef.current?.requestSubmit();
  }

  return (
    <form ref={formRef} action={formAction}>
      <fieldset disabled={pending} className="border-0 p-0 m-0">
        <legend className="sr-only">Choose a theme</legend>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {THEMES.map((theme) => {
            const isSelected = currentTheme === theme.id;
            return (
              <label
                key={theme.id}
                className={[
                  "cursor-pointer rounded-lg border-2 p-3 transition-all",
                  isSelected
                    ? "border-accent bg-accent-soft"
                    : "border-border bg-surface hover:border-accent/50",
                  pending ? "opacity-60 cursor-not-allowed" : "",
                ].join(" ")}
              >
                <input
                  type="radio"
                  name="theme"
                  value={theme.id}
                  defaultChecked={isSelected}
                  onChange={handleChange}
                  className="sr-only"
                />
                <div className="flex gap-1 mb-2">
                  {theme.swatches.map((color, i) => (
                    <span
                      key={i}
                      className="inline-block h-5 w-5 rounded-full border border-border/50"
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
                <span
                  className={[
                    "block text-sm font-medium",
                    isSelected ? "text-accent" : "text-text",
                  ].join(" ")}
                >
                  {theme.label}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
      {state.error ? (
        <p className="mt-2 text-sm text-red-600" role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
