export function px_to_min_size(
  min_px: number,
  group_width_px: number,
  fallback_percent: number,
  max_percent: number,
): number {
  if (group_width_px <= 0) return fallback_percent;
  // Quantized to 0.1% so per-pixel resize frames yield an identical value
  // and downstream reactive prop updates short-circuit.
  const percent = Math.ceil((min_px / group_width_px) * 1000) / 10;
  return Math.min(max_percent, percent);
}
