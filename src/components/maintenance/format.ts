export function formatCents(cents: number | null): string | null {
  if (cents == null) {
    return null;
  }
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function parseDollarsToCents(input: string): number | null {
  const normalized = input.replace(/[^0-9.]/g, "");
  if (!normalized) {
    return null;
  }
  const dollars = Number.parseFloat(normalized);
  if (Number.isNaN(dollars)) {
    return null;
  }
  return Math.round(dollars * 100);
}

export function centsToDollarInput(cents: number | null): string {
  if (cents == null) {
    return "";
  }
  return (cents / 100).toFixed(2);
}

export function formatDate(date: Date | null): string | null {
  if (!date) {
    return null;
  }
  return date.toLocaleDateString(undefined, { dateStyle: "medium" });
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
