export type Point = { x: number; y: number };

function cross(o: Point, a: Point, b: Point): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

export function convex_hull(points: readonly Point[]): Point[] {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (pts.length <= 1) return pts;

  const lower: Point[] = [];
  for (const p of pts) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0
    ) {
      lower.pop();
    }
    lower.push(p);
  }

  const upper: Point[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]!;
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0
    ) {
      upper.pop();
    }
    upper.push(p);
  }

  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

export function offset_polygon(
  polygon: readonly Point[],
  padding: number,
): Point[] {
  const n = polygon.length;
  if (n < 3) return [...polygon];

  const result: Point[] = [];
  for (let i = 0; i < n; i++) {
    const prev = polygon[(i - 1 + n) % n]!;
    const curr = polygon[i]!;
    const next = polygon[(i + 1) % n]!;

    const dx1 = curr.x - prev.x;
    const dy1 = curr.y - prev.y;
    const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1) || 1;
    const nx1 = -dy1 / len1;
    const ny1 = dx1 / len1;

    const dx2 = next.x - curr.x;
    const dy2 = next.y - curr.y;
    const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2) || 1;
    const nx2 = -dy2 / len2;
    const ny2 = dx2 / len2;

    const nx = nx1 + nx2;
    const ny = ny1 + ny2;
    const len = Math.sqrt(nx * nx + ny * ny) || 1;

    result.push({
      x: curr.x + (nx / len) * padding,
      y: curr.y + (ny / len) * padding,
    });
  }
  return result;
}
