export function toIso(date: Date | null | undefined): string | null {
  if (!date) {
    return null;
  }
  return date.toISOString();
}
