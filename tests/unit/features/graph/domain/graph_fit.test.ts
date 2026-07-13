import { describe, it, expect } from "vitest";
import { compute_fit_transform } from "$lib/features/graph/domain/graph_fit";

function cluster(n: number, spread = 100): { x: number; y: number }[] {
  return Array.from({ length: n }, (_, i) => ({
    x: (i % 5) * (spread / 5),
    y: Math.floor(i / 5) * (spread / 5),
  }));
}

describe("compute_fit_transform", () => {
  it("ignores a far outlier among 20+ clustered points", () => {
    const points = [...cluster(24), { x: 100_000, y: 100_000 }];
    const fit = compute_fit_transform(points, 800, 600, 40);
    expect(fit.scale).toBeGreaterThanOrEqual(0.7);
    expect(fit.center_x).toBeLessThan(1000);
    expect(fit.center_y).toBeLessThan(1000);
  });

  it("uses the full bbox for fewer than 20 points", () => {
    const fit = compute_fit_transform(
      [
        { x: 0, y: 0 },
        { x: 720, y: 520 },
      ],
      800,
      600,
      40,
    );
    expect(fit.scale).toBeCloseTo(1);
    expect(fit.center_x).toBeCloseTo(360);
    expect(fit.center_y).toBeCloseTo(260);

    const with_outlier = compute_fit_transform(
      [
        { x: 0, y: 0 },
        { x: 10, y: 10 },
        { x: 100_000, y: 0 },
      ],
      800,
      600,
      40,
    );
    expect(with_outlier.center_x).toBeCloseTo(50_000);
  });

  it("clamps scale to the readability floor for widely spread points", () => {
    const fit = compute_fit_transform(
      [
        { x: 0, y: 0 },
        { x: 100_000, y: 100_000 },
      ],
      800,
      600,
      40,
    );
    expect(fit.scale).toBe(0.7);
  });

  it("returns a safe transform for empty input", () => {
    const fit = compute_fit_transform([], 800, 600, 40);
    expect(fit).toEqual({ scale: 1, center_x: 0, center_y: 0 });
    expect(Number.isNaN(fit.scale)).toBe(false);
    expect(Number.isNaN(fit.center_x)).toBe(false);
    expect(Number.isNaN(fit.center_y)).toBe(false);
  });
});
