// "Today" / "Yesterday" / a short absolute date. Day identity follows the
// local calendar via toDateString, so the boundary is midnight, not 24h ago.
export function day_label(date: Date, now_ms: number): string {
  const key = date.toDateString();
  const now = new Date(now_ms);
  if (key === now.toDateString()) return "Today";
  const yesterday = new Date(now_ms);
  yesterday.setDate(yesterday.getDate() - 1);
  if (key === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
