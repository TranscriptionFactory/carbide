export type Segment = { x1: number; y1: number; x2: number; y2: number };

export type StrokeStyle = { width: number; color: number; alpha: number };

export type DashPattern = { dash: number; gap: number };

type PathSink = {
  moveTo(x: number, y: number): unknown;
  lineTo(x: number, y: number): unknown;
};

type StrokeSink = PathSink & { stroke(style: StrokeStyle): unknown };

export function append_dashed_segments(
  gfx: PathSink,
  segment: Segment,
  pattern: DashPattern,
): void {
  const { x1, y1, x2, y2 } = segment;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return;
  const ux = dx / len;
  const uy = dy / len;
  let drawn = 0;
  while (drawn < len) {
    const seg_end = Math.min(drawn + pattern.dash, len);
    gfx.moveTo(x1 + ux * drawn, y1 + uy * drawn);
    gfx.lineTo(x1 + ux * seg_end, y1 + uy * seg_end);
    drawn = seg_end + pattern.gap;
  }
}

export function stroke_lines(
  gfx: StrokeSink,
  segments: Segment[],
  style: StrokeStyle,
): void {
  if (segments.length === 0) return;
  for (const s of segments) {
    gfx.moveTo(s.x1, s.y1);
    gfx.lineTo(s.x2, s.y2);
  }
  gfx.stroke(style);
}

export function stroke_dashed_lines(
  gfx: StrokeSink,
  segments: Segment[],
  pattern: DashPattern,
  style: StrokeStyle,
): void {
  if (segments.length === 0) return;
  for (const s of segments) append_dashed_segments(gfx, s, pattern);
  gfx.stroke(style);
}

export function group_by_kind_alpha<T extends { kind_alpha: number }>(
  items: T[],
): Map<number, T[]> {
  const groups = new Map<number, T[]>();
  for (const item of items) {
    const group = groups.get(item.kind_alpha);
    if (group) group.push(item);
    else groups.set(item.kind_alpha, [item]);
  }
  return groups;
}
