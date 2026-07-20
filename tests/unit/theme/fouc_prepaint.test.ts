/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import app_html from "../../../src/app.html?raw";
const script_source = app_html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
if (!script_source) throw new Error("app.html prepaint script not found");
const prepaint = new Function(script_source);

const CACHE_KEY = "carbide_active_theme_cache";
const root = () => document.documentElement;

function run_with_cache(cache: unknown) {
  localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  prepaint();
}

describe("app.html FOUC prepaint gating", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    root().removeAttribute("data-color-scheme");
    root().removeAttribute("data-theme");
    root().removeAttribute("data-density");
    root().removeAttribute("style");
  });

  it("does nothing without a cache", () => {
    prepaint();
    expect(root().hasAttribute("data-color-scheme")).toBe(false);
    expect(root().hasAttribute("data-theme")).toBe(false);
  });

  it("pre-v2 cache: applies only the color scheme, never theme/tokens/density", () => {
    run_with_cache({
      color_scheme: "dark",
      data_theme: "cockpit",
      density: "compact",
      tokens: { "--background": "oklch(0.1 0 0)" },
    });
    expect(root().getAttribute("data-color-scheme")).toBe("dark");
    expect(root().style.getPropertyValue("color-scheme")).toBe("dark");
    expect(root().hasAttribute("data-theme")).toBe(false);
    expect(root().hasAttribute("data-density")).toBe(false);
    expect(root().style.getPropertyValue("--background")).toBe("");
  });

  it("v2 cache with a kept theme: applies theme, density, and tokens", () => {
    run_with_cache({
      v: 2,
      color_scheme: "light",
      data_theme: "obsidian",
      density: "compact",
      tokens: { "--accent-hue": "293.24" },
    });
    expect(root().getAttribute("data-color-scheme")).toBe("light");
    expect(root().getAttribute("data-theme")).toBe("obsidian");
    expect(root().getAttribute("data-density")).toBe("compact");
    expect(root().style.getPropertyValue("--accent-hue")).toBe("293.24");
  });

  it("v2 cache with a culled data_theme: drops the theme attribute", () => {
    run_with_cache({
      v: 2,
      color_scheme: "dark",
      data_theme: "cockpit",
    });
    expect(root().getAttribute("data-color-scheme")).toBe("dark");
    expect(root().hasAttribute("data-theme")).toBe(false);
  });

  it("allowlists exactly the kept themes", () => {
    for (const kept of [
      "carbide",
      "glass",
      "spotlight",
      "theater",
      "obsidian",
    ]) {
      run_with_cache({ v: 2, color_scheme: "dark", data_theme: kept });
      expect(root().getAttribute("data-theme")).toBe(kept);
      root().removeAttribute("data-theme");
    }
  });

  it("system preference resolves via matchMedia", () => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query.includes("dark"),
      media: query,
    })) as typeof window.matchMedia;
    try {
      run_with_cache({
        v: 2,
        color_scheme: "light",
        color_scheme_preference: "system",
        data_theme: "carbide",
      });
      expect(root().getAttribute("data-color-scheme")).toBe("dark");
    } finally {
      window.matchMedia = original;
    }
  });

  it("swallows malformed cache JSON", () => {
    localStorage.setItem(CACHE_KEY, "{not json");
    expect(() => prepaint()).not.toThrow();
    expect(root().hasAttribute("data-color-scheme")).toBe(false);
  });
});
