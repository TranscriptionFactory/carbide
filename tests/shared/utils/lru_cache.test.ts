import { describe, it, expect } from "vitest";
import { LruCache } from "$lib/shared/utils/lru_cache";

describe("LruCache", () => {
  it("returns undefined for missing keys and tracks misses", () => {
    const cache = new LruCache<string, number>(4);
    expect(cache.get("a")).toBe(undefined);
    expect(cache.stats().misses).toBe(1);
    expect(cache.stats().hits).toBe(0);
  });

  it("stores and retrieves values and tracks hits", () => {
    const cache = new LruCache<string, number>(4);
    cache.set("a", 1);
    expect(cache.get("a")).toBe(1);
    expect(cache.stats().hits).toBe(1);
    expect(cache.stats().insertions).toBe(1);
  });

  it("evicts least recently used entry when full", () => {
    const cache = new LruCache<string, number>(2);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.get("a"); // touch a, making b the LRU
    cache.set("c", 3); // evicts b
    expect(cache.get("a")).toBe(1);
    expect(cache.get("b")).toBe(undefined);
    expect(cache.get("c")).toBe(3);
    expect(cache.stats().evictions).toBe(1);
  });

  it("overwrites existing key without eviction", () => {
    const cache = new LruCache<string, number>(2);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("a", 10);
    expect(cache.get("a")).toBe(10);
    expect(cache.get("b")).toBe(2);
    expect(cache.stats().evictions).toBe(0);
  });

  it("invalidates a key", () => {
    const cache = new LruCache<string, number>(4);
    cache.set("a", 1);
    expect(cache.invalidate("a")).toBe(true);
    expect(cache.get("a")).toBe(undefined);
    expect(cache.invalidate("a")).toBe(false);
  });

  it("clears all entries", () => {
    const cache = new LruCache<string, number>(4);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.get("a")).toBe(undefined);
  });

  it("calculates hit rate correctly", () => {
    const cache = new LruCache<string, number>(4);
    cache.set("a", 1);
    cache.get("a"); // hit
    cache.get("a"); // hit
    cache.get("b"); // miss
    const stats = cache.stats();
    expect(stats.hit_rate).toBeCloseTo(2 / 3);
  });

  it("returns zero hit rate when no lookups performed", () => {
    const cache = new LruCache<string, number>(4);
    expect(cache.stats().hit_rate).toBe(0);
  });

  it("reports correct size", () => {
    const cache = new LruCache<string, number>(4);
    expect(cache.size).toBe(0);
    cache.set("a", 1);
    cache.set("b", 2);
    expect(cache.size).toBe(2);
    cache.invalidate("a");
    expect(cache.size).toBe(1);
  });

  it("has checks membership without affecting stats", () => {
    const cache = new LruCache<string, number>(4);
    cache.set("a", 1);
    expect(cache.has("a")).toBe(true);
    expect(cache.has("b")).toBe(false);
    expect(cache.stats().hits).toBe(0);
    expect(cache.stats().misses).toBe(0);
  });

  it("throws on zero capacity", () => {
    expect(() => new LruCache(0)).toThrow("capacity must be >= 1");
  });
});
