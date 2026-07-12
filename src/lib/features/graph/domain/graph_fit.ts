export type FitTransform = {
  scale: number;
  center_x: number;
  center_y: number;
};

const FIT_MIN_SCALE = 0.3;
const FIT_MAX_SCALE = 4;
const PERCENTILE_MIN_POINTS = 20;

export function compute_fit_transform(
  points: { x: number; y: number }[],
  screen_w: number,
  screen_h: number,
  padding = 40,
): FitTransform {
  if (points.length === 0) {
    return { scale: 1, center_x: 0, center_y: 0 };
  }
  const n = points.length;
  const xs = points.map((p) => p.x).sort((a, b) => a - b);
  const ys = points.map((p) => p.y).sort((a, b) => a - b);
  // 5th–95th percentile bbox so detached outliers can't crush the fit scale
  const use_percentile = n >= PERCENTILE_MIN_POINTS;
  const lo = use_percentile ? Math.floor(n * 0.05) : 0;
  const hi = use_percentile ? Math.ceil(n * 0.95) - 1 : n - 1;
  const min_x = xs[lo]!;
  const max_x = xs[hi]!;
  const min_y = ys[lo]!;
  const max_y = ys[hi]!;
  const raw_scale = Math.min(
    (screen_w - padding * 2) / Math.max(max_x - min_x, 1),
    (screen_h - padding * 2) / Math.max(max_y - min_y, 1),
  );
  return {
    scale: Math.min(Math.max(raw_scale, FIT_MIN_SCALE), FIT_MAX_SCALE),
    center_x: (min_x + max_x) / 2,
    center_y: (min_y + max_y) / 2,
  };
}
