/* eslint-disable @typescript-eslint/unbound-method */
import { describe, it, expect, vi } from "vitest";
import { PluginMarketplaceService } from "$lib/features/plugin/application/plugin_marketplace_service";
import { PluginMarketplaceStore } from "$lib/features/plugin/state/plugin_marketplace_store.svelte";
import type { MarketplacePort } from "$lib/features/plugin/ports";
import type { SettingsPort } from "$lib/features/settings";
import { OpStore } from "$lib/app/orchestration/op_store.svelte";

function make_marketplace_port(): MarketplacePort {
  return {
    fetch_index: vi.fn().mockResolvedValue("[]"),
    install_plugin: vi.fn().mockResolvedValue(undefined),
  };
}

function make_settings_port(): SettingsPort {
  const store = new Map<string, unknown>();
  return {
    get_setting: vi.fn((key: string) => {
      return Promise.resolve(store.get(key) ?? null);
    }) as unknown as SettingsPort["get_setting"],
    set_setting: vi.fn((key: string, value: unknown) => {
      store.set(key, value);
      return Promise.resolve();
    }),
  };
}

function make_service() {
  const marketplace_port = make_marketplace_port();
  const settings_port = make_settings_port();
  const store = new PluginMarketplaceStore();
  const op_store = new OpStore();
  const service = new PluginMarketplaceService(
    marketplace_port,
    settings_port,
    store,
    op_store,
  );
  return { service, marketplace_port, settings_port, store, op_store };
}

const SAMPLE_INDEX = JSON.stringify([
  {
    id: "test-plugin",
    name: "Test Plugin",
    version: "1.0.0",
    author: "Author",
    description: "A test plugin",
    files: ["manifest.json", "main.js"],
  },
]);

describe("PluginMarketplaceService", () => {
  describe("fetch_listings", () => {
    it("calls port and updates store", async () => {
      const { service, marketplace_port, store } = make_service();
      vi.mocked(marketplace_port.fetch_index).mockResolvedValue(SAMPLE_INDEX);

      await service.fetch_listings();

      expect(marketplace_port.fetch_index).toHaveBeenCalledWith(
        expect.stringContaining("raw.githubusercontent.com"),
      );
      expect(store.listings).toHaveLength(1);
      const first = store.listings[0];
      expect(first?.id).toBe("test-plugin");
      expect(first?.files).toHaveLength(2);
      expect(first?.files[0]?.downloadUrl).toContain(
        "raw.githubusercontent.com",
      );
    });

    it("uses stored URL when available", async () => {
      const { service, marketplace_port, settings_port } = make_service();
      vi.mocked(settings_port.get_setting).mockResolvedValue(
        "https://github.com/custom/repo",
      );
      vi.mocked(marketplace_port.fetch_index).mockResolvedValue("[]");

      await service.fetch_listings();

      expect(marketplace_port.fetch_index).toHaveBeenCalledWith(
        "https://raw.githubusercontent.com/custom/repo/refs/heads/main/plugins/index.json",
      );
    });

    it("defaults when no stored URL", async () => {
      const { service, marketplace_port } = make_service();
      vi.mocked(marketplace_port.fetch_index).mockResolvedValue("[]");

      await service.fetch_listings();

      expect(marketplace_port.fetch_index).toHaveBeenCalledWith(
        "https://raw.githubusercontent.com/TranscriptionFactory/carbide/refs/heads/main/plugins/index.json",
      );
    });

    it("calls op_store.fail on fetch error", async () => {
      const { service, marketplace_port, op_store } = make_service();
      vi.mocked(marketplace_port.fetch_index).mockRejectedValue(
        new Error("404 Not Found"),
      );
      const fail_spy = vi.spyOn(op_store, "fail");

      await expect(service.fetch_listings()).rejects.toThrow("404 Not Found");

      expect(fail_spy).toHaveBeenCalledWith(
        "plugin.marketplace_fetch",
        "404 Not Found",
      );
    });
  });

  describe("install", () => {
    it("resolves files from store and calls port", async () => {
      const { service, marketplace_port } = make_service();
      vi.mocked(marketplace_port.fetch_index).mockResolvedValue(SAMPLE_INDEX);
      await service.fetch_listings();

      await service.install("test-plugin");

      expect(marketplace_port.install_plugin).toHaveBeenCalledWith(
        "test-plugin",
        expect.arrayContaining([
          expect.objectContaining({ filename: "manifest.json" }),
          expect.objectContaining({ filename: "main.js" }),
        ]),
      );
    });

    it("errors when plugin ID not in listings", async () => {
      const { service } = make_service();

      await expect(service.install("nonexistent")).rejects.toThrow(
        "not found in marketplace",
      );
    });
  });

  describe("save_url", () => {
    it("writes to settings and updates store", async () => {
      const { service, settings_port, store } = make_service();

      await service.save_url("https://github.com/foo/bar");

      expect(settings_port.set_setting).toHaveBeenCalledWith(
        "plugin_marketplace_url",
        "https://github.com/foo/bar",
      );
      expect(store.url).toBe("https://github.com/foo/bar");
    });
  });

  describe("URL derivation", () => {
    it("derives correct file download URLs", async () => {
      const { service, marketplace_port, store } = make_service();
      vi.mocked(marketplace_port.fetch_index).mockResolvedValue(SAMPLE_INDEX);

      await service.fetch_listings();

      const listing = store.listings[0];
      expect(listing?.files[0]?.downloadUrl).toBe(
        "https://raw.githubusercontent.com/TranscriptionFactory/carbide/refs/heads/main/plugins/test-plugin/manifest.json",
      );
      expect(listing?.files[1]?.downloadUrl).toBe(
        "https://raw.githubusercontent.com/TranscriptionFactory/carbide/refs/heads/main/plugins/test-plugin/main.js",
      );
    });
  });
});
