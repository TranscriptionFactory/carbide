export function point_to_segment_distance(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len_sq = dx * dx + dy * dy;
  if (len_sq === 0) return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
  const t = Math.max(
    0,
    Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len_sq),
  );
  const proj_x = x1 + t * dx;
  const proj_y = y1 + t * dy;
  return Math.sqrt((px - proj_x) ** 2 + (py - proj_y) ** 2);
}
