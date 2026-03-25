import { describe, it, expect, vi } from "vitest";
import { register_bases_actions } from "$lib/features/bases/application/bases_actions";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import type { ActionRegistry } from "$lib/app/action_registry/action_registry";
import type { BasesService } from "$lib/features/bases/application/bases_service";
import { BasesStore } from "$lib/features/bases/state/bases_store.svelte";
import type { UIStore } from "$lib/app/orchestration/ui_store.svelte";
import type { VaultStore } from "$lib/features/vault";

function create_mock_registry() {
  const actions = new Map<string, any>();
  const registry = {
    register(action: any) {
      actions.set(action.id, action);
    },
    execute: vi.fn(),
  } as unknown as ActionRegistry;
  return { registry, actions };
}

function create_mock_ui_store(
  overrides: Partial<{ sidebar_open: boolean; sidebar_view: string }> = {},
) {
  return {
    sidebar_open: false,
    sidebar_view: "explorer",
    toggle_sidebar: vi.fn(),
    set_sidebar_view: vi.fn(),
    ...overrides,
  } as unknown as UIStore;
}

function create_mock_vault_store(vault_id: string | null = "vault-1") {
  return {
    active_vault_id: vault_id,
  } as unknown as VaultStore;
}

function create_mock_bases_service() {
  return {
    refresh_properties: vi.fn().mockResolvedValue(undefined),
    run_query: vi.fn().mockResolvedValue(undefined),
  } as unknown as BasesService;
}

describe("register_bases_actions", () => {
  it("registers toggle_panel and refresh actions", () => {
    const { registry, actions } = create_mock_registry();
    const store = new BasesStore();
    const ui_store = create_mock_ui_store();
    const vault_store = create_mock_vault_store();
    const service = create_mock_bases_service();

    register_bases_actions(registry, service, store, vault_store, ui_store);

    expect(actions.has(ACTION_IDS.bases_toggle_panel)).toBe(true);
    expect(actions.has(ACTION_IDS.bases_refresh)).toBe(true);
  });

  it("toggle_panel opens sidebar to bases when closed", () => {
    const { registry, actions } = create_mock_registry();
    const ui_store = create_mock_ui_store({ sidebar_open: false });
    register_bases_actions(
      registry,
      create_mock_bases_service(),
      new BasesStore(),
      create_mock_vault_store(),
      ui_store,
    );

    actions.get(ACTION_IDS.bases_toggle_panel).execute();

    expect(ui_store.set_sidebar_view).toHaveBeenCalledWith("bases");
  });

  it("toggle_panel closes sidebar when already showing bases", () => {
    const { registry, actions } = create_mock_registry();
    const ui_store = create_mock_ui_store({
      sidebar_open: true,
      sidebar_view: "bases",
    });
    register_bases_actions(
      registry,
      create_mock_bases_service(),
      new BasesStore(),
      create_mock_vault_store(),
      ui_store,
    );

    actions.get(ACTION_IDS.bases_toggle_panel).execute();

    expect(ui_store.toggle_sidebar).toHaveBeenCalled();
  });

  it("refresh calls service methods with vault_id", async () => {
    const { registry, actions } = create_mock_registry();
    const service = create_mock_bases_service();
    register_bases_actions(
      registry,
      service,
      new BasesStore(),
      create_mock_vault_store("v1"),
      create_mock_ui_store(),
    );

    await actions.get(ACTION_IDS.bases_refresh).execute();

    expect(service.refresh_properties).toHaveBeenCalledWith("v1");
    expect(service.run_query).toHaveBeenCalledWith("v1");
  });

  it("refresh does nothing when no vault is active", async () => {
    const { registry, actions } = create_mock_registry();
    const service = create_mock_bases_service();
    register_bases_actions(
      registry,
      service,
      new BasesStore(),
      create_mock_vault_store(null),
      create_mock_ui_store(),
    );

    await actions.get(ACTION_IDS.bases_refresh).execute();

    expect(service.refresh_properties).not.toHaveBeenCalled();
  });
});
