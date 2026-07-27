export function px_to_min_size(
  min_px: number,
  group_width_px: number,
  fallback_percent: number,
  max_percent: number,
): number {
  if (group_width_px <= 0) return fallback_percent;
  const percent = (min_px / group_width_px) * 100;
  return Math.min(max_percent, percent);
}
