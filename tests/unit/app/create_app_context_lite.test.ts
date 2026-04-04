import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const plugin_destroy = vi.fn();
  const plugin_service_constructor = vi.fn(() => ({
    set_settings_service: vi.fn(),
    on_plugin_cleanup: vi.fn(),
    register_sidebar_view: vi.fn(),
    initialize_rpc: vi.fn(),
    destroy: plugin_destroy,
  }));

  return {
    plugin_destroy,
    plugin_service_constructor,
    plugin_settings_service_constructor: vi.fn(() => ({})),
    register_plugin_actions: vi.fn(),
    code_lsp_service_constructor: vi.fn(() => ({
      start: vi.fn(),
      stop: vi.fn(),
    })),
    graph_service_constructor: vi.fn(() => ({})),
    register_graph_actions: vi.fn(),
    ai_service_constructor: vi.fn(() => ({})),
    register_ai_actions: vi.fn(),
    bases_service_constructor: vi.fn(() => ({})),
    register_bases_actions: vi.fn(),
    task_service_constructor: vi.fn(() => ({})),
    register_task_actions: vi.fn(),
    canvas_service_constructor: vi.fn(() => ({})),
    register_canvas_actions: vi.fn(),
    tag_service_constructor: vi.fn(() => ({})),
    register_tag_actions: vi.fn(),
    metadata_service_constructor: vi.fn(() => ({})),
    register_metadata_actions: vi.fn(),
    toolchain_service_constructor: vi.fn(() => ({
      dispose: vi.fn(),
    })),
    register_toolchain_actions: vi.fn(),
    query_service_constructor: vi.fn(() => ({})),
    register_query_actions: vi.fn(),
    reference_service_constructor: vi.fn(() => ({
      register_extension: vi.fn(),
    })),
    register_reference_actions: vi.fn(),
    zotero_extension_constructor: vi.fn(() => ({})),
    create_zotero_bbt_adapter: vi.fn(() => ({})),
    mount_lite_reactors: vi.fn(),
    mount_full_reactors: vi.fn(),
  };
});

vi.mock("$lib/features/plugin", async () => {
  const actual = await vi.importActual<typeof import("$lib/features/plugin")>(
    "$lib/features/plugin",
  );
  return {
    ...actual,
    PluginService: mocks.plugin_service_constructor,
    PluginSettingsService: mocks.plugin_settings_service_constructor,
    register_plugin_actions: mocks.register_plugin_actions,
    PluginManager: {},
  };
});

vi.mock("$lib/features/code_lsp", async () => {
  const actual = await vi.importActual<typeof import("$lib/features/code_lsp")>(
    "$lib/features/code_lsp",
  );
  return {
    ...actual,
    CodeLspService: mocks.code_lsp_service_constructor,
  };
});

vi.mock("$lib/features/graph", async () => {
  const actual = await vi.importActual<typeof import("$lib/features/graph")>(
    "$lib/features/graph",
  );
  return {
    ...actual,
    GraphService: mocks.graph_service_constructor,
    register_graph_actions: mocks.register_graph_actions,
  };
});

vi.mock("$lib/features/ai", async () => {
  const actual =
    await vi.importActual<typeof import("$lib/features/ai")>(
      "$lib/features/ai",
    );
  return {
    ...actual,
    AiService: mocks.ai_service_constructor,
    register_ai_actions: mocks.register_ai_actions,
  };
});

vi.mock("$lib/features/bases", async () => {
  const actual = await vi.importActual<typeof import("$lib/features/bases")>(
    "$lib/features/bases",
  );
  return {
    ...actual,
    BasesService: mocks.bases_service_constructor,
    BasesPanel: {},
    register_bases_actions: mocks.register_bases_actions,
  };
});

vi.mock("$lib/features/task", async () => {
  const actual =
    await vi.importActual<typeof import("$lib/features/task")>(
      "$lib/features/task",
    );
  return {
    ...actual,
    TaskService: mocks.task_service_constructor,
    register_task_actions: mocks.register_task_actions,
  };
});

vi.mock("$lib/features/canvas", async () => {
  const actual = await vi.importActual<typeof import("$lib/features/canvas")>(
    "$lib/features/canvas",
  );
  return {
    ...actual,
    CanvasService: mocks.canvas_service_constructor,
    register_canvas_actions: mocks.register_canvas_actions,
    CanvasPanel: {},
  };
});

vi.mock("$lib/features/tags", async () => {
  const actual =
    await vi.importActual<typeof import("$lib/features/tags")>(
      "$lib/features/tags",
    );
  return {
    ...actual,
    TagService: mocks.tag_service_constructor,
    register_tag_actions: mocks.register_tag_actions,
  };
});

vi.mock("$lib/features/metadata", async () => {
  const actual = await vi.importActual<typeof import("$lib/features/metadata")>(
    "$lib/features/metadata",
  );
  return {
    ...actual,
    MetadataService: mocks.metadata_service_constructor,
    register_metadata_actions: mocks.register_metadata_actions,
  };
});

vi.mock("$lib/features/toolchain", async () => {
  const actual = await vi.importActual<
    typeof import("$lib/features/toolchain")
  >("$lib/features/toolchain");
  return {
    ...actual,
    ToolchainService: mocks.toolchain_service_constructor,
    register_toolchain_actions: mocks.register_toolchain_actions,
  };
});

vi.mock("$lib/features/query", async () => {
  const actual = await vi.importActual<typeof import("$lib/features/query")>(
    "$lib/features/query",
  );
  return {
    ...actual,
    QueryService: mocks.query_service_constructor,
    register_query_actions: mocks.register_query_actions,
  };
});

vi.mock("$lib/features/reference", async () => {
  const actual = await vi.importActual<
    typeof import("$lib/features/reference")
  >("$lib/features/reference");
  return {
    ...actual,
    ReferenceService: mocks.reference_service_constructor,
    register_reference_actions: mocks.register_reference_actions,
    CitationPicker: {},
  };
});

vi.mock("$lib/features/zotero_bbt", () => ({
  ZoteroBbtExtension: mocks.zotero_extension_constructor,
  create_zotero_bbt_adapter: mocks.create_zotero_bbt_adapter,
}));

vi.mock("$lib/generated/bindings", () => ({}));

vi.mock("$lib/app/lite/mount_lite_reactors", () => ({
  mount_lite_reactors: mocks.mount_lite_reactors,
}));

vi.mock("$lib/app/full/mount_full_reactors", () => ({
  mount_full_reactors: mocks.mount_full_reactors,
}));

import { create_app_context } from "$lib/app/di/create_app_context";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
function create_ports() {
  return {
    vault: {},
    notes: {},
    index: {},
    search: {},
    settings: {},
    vault_settings: {},
    assets: {},
    editor: {},
    clipboard: {},
    shell: {},
    git: {},
    document: {},
    terminal: { destroy: vi.fn() },
    window: {},
    watcher: { unwatch_vault: vi.fn(async () => undefined) },
    ai: {},
    graph: {},
    bases: {},
    task: {},
    plugin: {},
    plugin_settings: {},
    canvas: {},
    tag: {},
    lint: { stop: vi.fn(async () => undefined) },
    markdown_lsp: { stop: vi.fn(async () => undefined) },
    toolchain: {},
    code_lsp: {},
    saved_query: {},
    reference_storage: {},
    citation: {},
    doi_lookup: {},
    linked_source: {},
  } as never;
}

describe("create_app_context lite composition", () => {
  beforeEach(() => {
    for (const value of Object.values(mocks)) {
      if (typeof value === "function") {
        value.mockReset();
      }
    }
    mocks.mount_lite_reactors.mockReturnValue(vi.fn());
    mocks.mount_full_reactors.mockReturnValue(vi.fn());
    mocks.plugin_service_constructor.mockReturnValue({
      set_settings_service: vi.fn(),
      on_plugin_cleanup: vi.fn(),
      register_sidebar_view: vi.fn(),
      initialize_rpc: vi.fn(),
      destroy: mocks.plugin_destroy,
    });
    mocks.code_lsp_service_constructor.mockReturnValue({
      start: vi.fn(),
      stop: vi.fn(),
    });
    mocks.toolchain_service_constructor.mockReturnValue({
      dispose: vi.fn(),
    });
    mocks.reference_service_constructor.mockReturnValue({
      register_extension: vi.fn(),
    });
  });

  it("does not construct full-only runtime services for lite", () => {
    const context = create_app_context({
      ports: create_ports(),
      default_mount_config: {
        reset_app_state: false,
        bootstrap_default_vault_path: null,
      },
      app_target: "lite",
    });

    expect(mocks.plugin_settings_service_constructor).not.toHaveBeenCalled();
    expect(mocks.plugin_service_constructor).not.toHaveBeenCalled();
    expect(mocks.code_lsp_service_constructor).not.toHaveBeenCalled();
    expect(mocks.graph_service_constructor).not.toHaveBeenCalled();
    expect(mocks.ai_service_constructor).not.toHaveBeenCalled();
    expect(mocks.bases_service_constructor).not.toHaveBeenCalled();
    expect(mocks.task_service_constructor).not.toHaveBeenCalled();
    expect(mocks.canvas_service_constructor).not.toHaveBeenCalled();
    expect(mocks.tag_service_constructor).not.toHaveBeenCalled();
    expect(mocks.metadata_service_constructor).not.toHaveBeenCalled();
    expect(mocks.toolchain_service_constructor).not.toHaveBeenCalled();
    expect(mocks.query_service_constructor).not.toHaveBeenCalled();
    expect(mocks.reference_service_constructor).not.toHaveBeenCalled();
    expect(mocks.zotero_extension_constructor).not.toHaveBeenCalled();
    expect(mocks.create_zotero_bbt_adapter).not.toHaveBeenCalled();

    expect(mocks.register_plugin_actions).not.toHaveBeenCalled();
    expect(mocks.register_graph_actions).not.toHaveBeenCalled();
    expect(mocks.register_ai_actions).not.toHaveBeenCalled();
    expect(mocks.register_bases_actions).not.toHaveBeenCalled();
    expect(mocks.register_task_actions).not.toHaveBeenCalled();
    expect(mocks.register_canvas_actions).not.toHaveBeenCalled();
    expect(mocks.register_tag_actions).not.toHaveBeenCalled();
    expect(mocks.register_metadata_actions).not.toHaveBeenCalled();
    expect(mocks.register_toolchain_actions).not.toHaveBeenCalled();
    expect(mocks.register_query_actions).not.toHaveBeenCalled();
    expect(mocks.register_reference_actions).not.toHaveBeenCalled();

    expect(mocks.mount_full_reactors).not.toHaveBeenCalled();
    expect(mocks.mount_lite_reactors).toHaveBeenCalledTimes(1);
    expect(mocks.mount_lite_reactors).toHaveBeenCalledWith(
      expect.not.objectContaining({
        plugin_service: expect.anything(),
        graph_service: expect.anything(),
        bases_service: expect.anything(),
        task_service: expect.anything(),
        metadata_service: expect.anything(),
        toolchain_service: expect.anything(),
        code_lsp_service: expect.anything(),
        reference_service: expect.anything(),
      }),
    );

    expect(
      (context.services as { reference?: unknown }).reference,
    ).toBeUndefined();
    expect(context.stores.ai).toBeUndefined();
    expect(context.stores.plugin).toBeUndefined();
    expect(context.stores.plugin_settings).toBeUndefined();
    expect(context.stores.canvas).toBeUndefined();
    expect(context.stores.tag).toBeUndefined();
    expect(context.stores.metadata).toBeUndefined();
    expect(context.stores.toolchain).toBeUndefined();
    expect(context.stores.code_lsp).toBeUndefined();
    expect(context.stores.query).toBeUndefined();
    expect(context.stores.reference).toBeUndefined();
    expect(context.stores.graph).toBeUndefined();
    expect(context.stores.bases).toBeUndefined();
    expect(context.stores.task).toBeUndefined();

    expect(
      (context.services as { bases?: unknown }).bases,
    ).toBeUndefined();
    expect(
      (context.services as { task?: unknown }).task,
    ).toBeUndefined();
    expect(
      (context.services as { plugin?: unknown }).plugin,
    ).toBeUndefined();
    expect(
      (context.services as { plugin_settings?: unknown }).plugin_settings,
    ).toBeUndefined();

    const registered_action_ids = new Set(
      context.action_registry.get_all().map((action) => action.id),
    );
    expect(registered_action_ids.has(ACTION_IDS.lsp_code_actions)).toBe(false);
    expect(registered_action_ids.has(ACTION_IDS.lsp_code_action_resolve)).toBe(
      false,
    );
    expect(registered_action_ids.has(ACTION_IDS.lsp_refresh_diagnostics)).toBe(
      false,
    );
    expect(registered_action_ids.has(ACTION_IDS.lsp_toggle_results)).toBe(
      false,
    );
    expect(registered_action_ids.has(ACTION_IDS.iwe_extract_section)).toBe(
      false,
    );
    expect(registered_action_ids.has(ACTION_IDS.iwe_refresh_transforms)).toBe(
      false,
    );
    expect(registered_action_ids.has(ACTION_IDS.ui_open_vault_dashboard)).toBe(
      false,
    );
    expect(registered_action_ids.has(ACTION_IDS.ui_close_vault_dashboard)).toBe(
      false,
    );
    expect(registered_action_ids.has(ACTION_IDS.ui_quick_capture)).toBe(false);
    expect(registered_action_ids.has(ACTION_IDS.ui_toggle_tasks_panel)).toBe(
      false,
    );
    expect(registered_action_ids.has(ACTION_IDS.ui_show_tasks_list)).toBe(
      false,
    );
    expect(registered_action_ids.has(ACTION_IDS.ui_show_tasks_kanban)).toBe(
      false,
    );
    expect(registered_action_ids.has(ACTION_IDS.ui_show_tasks_schedule)).toBe(
      false,
    );
    expect(registered_action_ids.has(ACTION_IDS.query_open)).toBe(false);
    expect(registered_action_ids.has(ACTION_IDS.query_execute)).toBe(false);

    context.destroy();
    expect(mocks.plugin_destroy).not.toHaveBeenCalled();
  });
});
