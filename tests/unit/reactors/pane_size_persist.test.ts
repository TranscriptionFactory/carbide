import { describe, expect, it, vi } from "vitest";
import { SettingsService } from "$lib/features/settings/application/settings_service";
import { VaultStore } from "$lib/features/vault/state/vault_store.svelte";
import { OpStore } from "$lib/app/orchestration/op_store.svelte";
import { UIStore } from "$lib/app/orchestration/ui_store.svelte";
import { PANE_SIZE_FIELDS } from "$lib/reactors/pane_size_fields";

function make_service() {
  const store = new Map<string, unknown>();
  const settings_port = {
    get_setting: vi.fn((key: string) =>
      Promise.resolve(store.has(key) ? store.get(key) : null),
    ),
    set_setting: vi.fn((key: string, value: unknown) => {
      store.set(key, value);
      return Promise.resolve();
    }),
  };
  const vault_settings_port = {
    get_vault_setting: vi.fn().mockResolvedValue(null),
    set_vault_setting: vi.fn().mockResolvedValue(undefined),
  };
  const service = new SettingsService(
    vault_settings_port as never,
    settings_port as never,
    new VaultStore(),
    new OpStore(),
    () => 1,
  );
  return { service, store };
}

describe("pane size persistence", () => {
  it("round-trips every pane size through the settings service across a restart", async () => {
    const { service } = make_service();
    const before = new UIStore();
    const sizes = [17, 23, 29, 31, 37];
    expect(PANE_SIZE_FIELDS.length).toBe(sizes.length);

    PANE_SIZE_FIELDS.forEach((field, index) =>
      field.set(before, sizes[index]!),
    );
    await Promise.all(
      PANE_SIZE_FIELDS.map((field) =>
        service.save_pane_size(field.key, field.get(before)),
      ),
    );

    const after = new UIStore();
    const loaded = await Promise.all(
      PANE_SIZE_FIELDS.map((field) => service.load_pane_size(field.key)),
    );
    loaded.forEach((size, index) => {
      if (size !== null) PANE_SIZE_FIELDS[index]!.set(after, size);
    });

    PANE_SIZE_FIELDS.forEach((field, index) =>
      expect(field.get(after)).toBe(sizes[index]),
    );
  });

  it("maps each pane field to a distinct store property and key", () => {
    const store = new UIStore();
    PANE_SIZE_FIELDS.forEach((field, index) => field.set(store, 100 + index));
    PANE_SIZE_FIELDS.forEach((field, index) =>
      expect(field.get(store)).toBe(100 + index),
    );

    const keys = PANE_SIZE_FIELDS.map((field) => field.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("treats missing or non-numeric stored sizes as absent", async () => {
    const { service, store } = make_service();
    expect(await service.load_pane_size("sidebar_pane_size")).toBeNull();

    store.set("sidebar_pane_size", "wide");
    expect(await service.load_pane_size("sidebar_pane_size")).toBeNull();

    store.set("sidebar_pane_size", 42);
    expect(await service.load_pane_size("sidebar_pane_size")).toBe(42);
  });
});
