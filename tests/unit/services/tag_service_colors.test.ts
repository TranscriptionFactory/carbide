import { describe, it, expect, vi } from "vitest";
import { TagService } from "$lib/features/tags/application/tag_service";
import { TagStore } from "$lib/features/tags/state/tag_store.svelte";
import type { TagPort } from "$lib/features/tags/ports";
import type { VaultSettingsPort } from "$lib/features/vault";

function make_vault_store(vault_id: string | null = "vault-1") {
  return {
    vault: vault_id ? { id: vault_id, name: "Test", path: "/test" } : null,
  } as never;
}

function make_port(): TagPort {
  return {
    list_all_tags: vi.fn().mockResolvedValue([]),
    get_notes_for_tag: vi.fn().mockResolvedValue([]),
    get_notes_for_tag_prefix: vi.fn().mockResolvedValue([]),
  };
}

function make_settings_port(
  overrides: Partial<VaultSettingsPort> = {},
): VaultSettingsPort {
  return {
    get_vault_setting: vi.fn().mockResolvedValue(null),
    set_vault_setting: vi.fn().mockResolvedValue(undefined),
    get_local_setting: vi.fn().mockResolvedValue(null),
    set_local_setting: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function make_service(
  settings_overrides: Partial<VaultSettingsPort> = {},
  vault_id: string | null = "vault-1",
) {
  const store = new TagStore();
  const settings_port = make_settings_port(settings_overrides);
  const service = new TagService(
    make_port(),
    store,
    make_vault_store(vault_id),
    settings_port,
  );
  return { service, store, settings_port };
}

describe("TagService tag colors", () => {
  it("load_tag_colors sanitizes the persisted setting into the store", async () => {
    const { service, store, settings_port } = make_service({
      get_vault_setting: vi.fn().mockResolvedValue({
        "#Rust": "red",
        bad_color: "nope",
      }),
    });

    await service.load_tag_colors();

    expect(settings_port.get_vault_setting).toHaveBeenCalledWith(
      "vault-1",
      "tag_colors",
    );
    expect(store.tag_colors).toEqual({ rust: "red" });
  });

  it("load_tag_colors without a vault does not touch the port", async () => {
    const { service, settings_port } = make_service({}, null);

    await service.load_tag_colors();

    expect(settings_port.get_vault_setting).not.toHaveBeenCalled();
  });

  it("set_tag_color normalizes the tag, updates the store, and persists", async () => {
    const { service, store, settings_port } = make_service();

    await service.set_tag_color("#Rust", "red");

    expect(store.tag_colors).toEqual({ rust: "red" });
    expect(settings_port.set_vault_setting).toHaveBeenCalledWith(
      "vault-1",
      "tag_colors",
      { rust: "red" },
    );
  });

  it("set_tag_color with an invalid color changes nothing", async () => {
    const { service, store, settings_port } = make_service();

    await service.set_tag_color("rust", "not-a-color");

    expect(store.tag_colors).toEqual({});
    expect(settings_port.set_vault_setting).not.toHaveBeenCalled();
  });

  it("clear_tag_color removes the entry and persists", async () => {
    const { service, store, settings_port } = make_service();
    store.set_tag_colors({ rust: "red", svelte: "teal" });

    await service.clear_tag_color("#Rust");

    expect(store.tag_colors).toEqual({ svelte: "teal" });
    expect(settings_port.set_vault_setting).toHaveBeenCalledWith(
      "vault-1",
      "tag_colors",
      { svelte: "teal" },
    );
  });

  it("clear_tag_color for an unknown tag does not persist", async () => {
    const { service, settings_port } = make_service();

    await service.clear_tag_color("unknown");

    expect(settings_port.set_vault_setting).not.toHaveBeenCalled();
  });

  it("persist failure records the error but keeps the optimistic store value", async () => {
    const { service, store } = make_service({
      set_vault_setting: vi.fn().mockRejectedValue(new Error("disk full")),
    });

    await service.set_tag_color("rust", "red");

    expect(store.tag_colors).toEqual({ rust: "red" });
    expect(store.error).toBe("disk full");
  });
});
