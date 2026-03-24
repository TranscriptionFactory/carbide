import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  should_check,
  mark_checked,
  is_version_skipped,
  skip_version,
} from "$lib/reactors/update_check.reactor.svelte";

describe("update_check_reactor", () => {
  let store: Map<string, string>;

  beforeEach(() => {
    store = new Map();
    globalThis.localStorage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
      clear: () => store.clear(),
      get length() {
        return store.size;
      },
      key: () => null,
    };
  });

  afterEach(() => {
    // @ts-expect-error cleanup stub
    delete globalThis.localStorage;
  });

  describe("should_check", () => {
    it("returns true when no previous check exists", () => {
      expect(should_check()).toBe(true);
    });

    it("returns false when checked less than 24h ago", () => {
      store.set("carbide:last_update_check", new Date().toISOString());
      expect(should_check()).toBe(false);
    });

    it("returns true when checked more than 24h ago", () => {
      const old_date = new Date(Date.now() - 25 * 60 * 60 * 1000);
      store.set("carbide:last_update_check", old_date.toISOString());
      expect(should_check()).toBe(true);
    });

    it("returns true when stored value is invalid", () => {
      store.set("carbide:last_update_check", "not-a-date");
      expect(should_check()).toBe(true);
    });
  });

  describe("mark_checked", () => {
    it("writes a valid ISO timestamp", () => {
      mark_checked();
      const stored = store.get("carbide:last_update_check");
      expect(stored).toBeTruthy();
      expect(new Date(stored!).getTime()).toBeGreaterThan(0);
    });
  });

  describe("is_version_skipped", () => {
    it("returns false when no skipped version", () => {
      expect(is_version_skipped("1.1.0")).toBe(false);
    });

    it("returns true when version matches", () => {
      store.set("carbide:skipped_update_version", "1.1.0");
      expect(is_version_skipped("1.1.0")).toBe(true);
    });

    it("returns false when version differs", () => {
      store.set("carbide:skipped_update_version", "1.1.0");
      expect(is_version_skipped("1.2.0")).toBe(false);
    });
  });

  describe("skip_version", () => {
    it("stores the version", () => {
      skip_version("2.0.0");
      expect(store.get("carbide:skipped_update_version")).toBe("2.0.0");
    });

    it("overwrites previously skipped version", () => {
      skip_version("1.0.0");
      skip_version("2.0.0");
      expect(store.get("carbide:skipped_update_version")).toBe("2.0.0");
    });
  });
});
