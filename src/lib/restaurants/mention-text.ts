export function combineRestaurantMentionText(
  notes: string | null | undefined,
  visitNote: string | null | undefined,
): string {
  const parts = [notes, visitNote].filter((part): part is string => Boolean(part?.trim()));
  return parts.join("\n\n");
}
