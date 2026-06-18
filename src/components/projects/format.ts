import type { ProjectComponentKind } from "@/db/schema";

export function deriveProjectTitle(title: string | undefined, notes: string | undefined): string {
  const trimmedTitle = title?.trim();
  if (trimmedTitle) {
    return trimmedTitle.slice(0, 200);
  }

  const firstLine = notes
    ?.split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  if (firstLine) {
    return firstLine.slice(0, 200);
  }

  return `Untitled ${new Date().toLocaleDateString()}`;
}

export function formatCents(cents: number): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function parseDollarsToCents(input: string): number {
  const normalized = input.replace(/[^0-9.]/g, "");
  if (!normalized) {
    return 0;
  }
  const dollars = Number.parseFloat(normalized);
  if (Number.isNaN(dollars)) {
    return 0;
  }
  return Math.round(dollars * 100);
}

export function centsToDollarInput(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function notesExcerpt(notes: string | null, maxLength = 160): string | null {
  if (!notes?.trim()) {
    return null;
  }
  const plain = notes
    .replace(/^#+\s+/gm, "")
    .replace(/[*_~`>#-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!plain) {
    return null;
  }
  return plain.length > maxLength ? `${plain.slice(0, maxLength)}…` : plain;
}

export function componentKindLabel(kind: ProjectComponentKind): string {
  switch (kind) {
    case "item":
      return "Item";
    case "labor":
      return "Labor";
    case "fee":
      return "Fee";
    case "other":
      return "Other";
  }
}

const componentKindChipStyles: Record<ProjectComponentKind, string> = {
  item: "border-sky-200 bg-sky-50 text-sky-800",
  labor: "border-accent/30 bg-accent-soft text-accent",
  fee: "border-amber-200 bg-amber-50 text-amber-900",
  other: "border-stone-300 bg-stone-100 text-stone-700",
};

const componentKindRowStyles: Record<ProjectComponentKind, string> = {
  item: "border-l-sky-400",
  labor: "border-l-accent",
  fee: "border-l-amber-400",
  other: "border-l-stone-400",
};

export function componentKindChipClass(kind: ProjectComponentKind): string {
  return componentKindChipStyles[kind];
}

export function componentKindRowClass(kind: ProjectComponentKind): string {
  return componentKindRowStyles[kind];
}

export function purchaseLinkLabel(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return url.length > 40 ? `${url.slice(0, 40)}…` : url;
  }
}

export function acquiredLabel(kind: ProjectComponentKind): string {
  switch (kind) {
    case "item":
      return "Owned";
    case "fee":
      return "Paid";
    case "labor":
    case "other":
      return "Done";
  }
}
