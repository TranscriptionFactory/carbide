import { beforeEach, describe, expect, it, vi } from "vitest";
import { ActionRegistry } from "$lib/app/action_registry/action_registry";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import { register_rag_actions, RagStore } from "$lib/features/rag";
import { AssistantSessionStore } from "$lib/features/assistant";
import type { RunEvent, RunSpec } from "$lib/features/assistant";
import { create_test_run_starter } from "../../adapters/test_run_starter";
import { UIStore } from "$lib/app/orchestration/ui_store.svelte";
import { OpStore } from "$lib/app/orchestration/op_store.svelte";
import { BUILTIN_PROVIDER_PRESETS } from "$lib/shared/types/ai_provider_config";
import { toast } from "svelte-sonner";

vi.mock("svelte-sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    loading: vi.fn(),
  },
}));

const AGENT_EVENTS: RunEvent[] = [
  { type: "session", provider_session_id: "sess-1" },
  { type: "text", text: "All organized." },
  { type: "done", stats: {} },
];

function agent_spec(specs: RunSpec[]) {
  const spec = specs[0];
  if (!spec || spec.request.mode !== "agent") {
    throw new Error("expected an agent-mode run");
  }
  return { kind: spec.kind, ...spec.request };
}

type HarnessOpenNote = { meta: { path: string }; is_dirty: boolean } | null;
type HarnessTab = { id: string; is_dirty: boolean } | null;

function create_harness(
  events: RunEvent[] = AGENT_EVENTS,
  workspace: { open_note?: HarnessOpenNote; background_tab?: HarnessTab } = {},
) {
  const registry = new ActionRegistry();
  const rag_store = new RagStore(new AssistantSessionStore());
  const stores = {
    ui: new UIStore(),
    op: new OpStore(),
    vault: {
      active_vault_id: "v1",
      vault: { id: "v1", name: "demo", path: "/vault/demo" },
    },
    editor: { open_note: workspace.open_note ?? null },
    tab: {
      active_tab_id: "active-tab",
      find_tab_by_path: vi.fn(() => workspace.background_tab ?? null),
      invalidate_cache_by_path: vi.fn(),
    },
  };
  stores.ui.editor_settings.ai_providers = BUILTIN_PROVIDER_PRESETS;
  stores.ui.editor_settings.ai_default_provider_id = "claude";

  const rag_service = {
    save_session: vi.fn().mockResolvedValue(undefined),
    delete_session: vi.fn().mockResolvedValue(undefined),
    generate_title: vi.fn().mockResolvedValue(null),
  };

  const run_starter = create_test_run_starter(() => events);
  const assistant_kernel = {
    start: run_starter.start,
    specs: run_starter.specs,
    resolve_provider: vi.fn((requested_id?: string) =>
      Promise.resolve(
        stores.ui.editor_settings.ai_providers.find(
          (p) => p.id === requested_id,
        ) ?? null,
      ),
    ),
  };

  const git_service = {
    create_checkpoint: vi.fn().mockResolvedValue({ status: "created" }),
  };
  const note_service = {
    open_note: vi
      .fn()
      .mockResolvedValue({ status: "opened", selected_folder_path: "" }),
    clear_open_note: vi.fn(),
  };
  const editor_service = { close_buffer: vi.fn() };
  const tab_service = {
    mark_conflict: vi.fn(),
    invalidate_cache: vi.fn(),
    remove_tab: vi.fn(),
  };

  register_rag_actions({
    registry,
    stores: stores as never,
    services: {
      git: git_service,
      note: note_service,
      editor: editor_service,
      tab: tab_service,
    } as never,
    default_mount_config: {
      reset_app_state: true,
      bootstrap_default_vault_path: null,
    },
    rag_store,
    rag_service: rag_service as never,
    assistant_kernel: assistant_kernel as never,
  });

  return {
    registry,
    stores,
    rag_store,
    rag_service,
    assistant_kernel,
    git_service,
    note_service,
    editor_service,
    tab_service,
  };
}

function register_refresh_tree(registry: ActionRegistry) {
  const refresh = vi.fn();
  registry.register({
    id: ACTION_IDS.folder_refresh_tree,
    label: "Refresh Tree",
    execute: refresh,
  });
  return refresh;
}

function agent_write_events(paths: string[]): RunEvent[] {
  return [
    { type: "session", provider_session_id: "sess-write" },
    {
      type: "tool_start",
      name: "Write",
      input_summary: '{"content":"…truncated',
      paths,
      mutating: true,
    },
    { type: "tool_end", name: "Write", ok: true },
    { type: "text", text: "Written." },
    { type: "done", stats: {} },
  ];
}

function agent_delete_events(path: string): RunEvent[] {
  return [
    { type: "session", provider_session_id: "sess-delete" },
    {
      type: "tool_start",
      name: "mcp__carbide__delete_note",
      input_summary: `{"path":"${path}"}`,
      paths: [path],
      mutating: true,
    },
    { type: "tool_end", name: "mcp__carbide__delete_note", ok: true },
    { type: "text", text: "Deleted." },
    { type: "done", stats: {} },
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("rag agent actions", () => {
  // I3: rag_actions used to carry its own `auto` rule that returned
  // providers[0] with no availability probe. It now asks the one resolver.
  it("ask: resolves the provider through the kernel, not a local rule", async () => {
    const { registry, stores, rag_store, assistant_kernel } = create_harness();
    rag_store.set_mode("agent");
    stores.ui.editor_settings.ai_default_provider_id = "auto";
    assistant_kernel.resolve_provider.mockResolvedValue(
      stores.ui.editor_settings.ai_providers.find((p) => p.id === "claude") ??
        null,
    );

    await registry.execute(ACTION_IDS.rag_ask, "organize my notes");

    expect(assistant_kernel.resolve_provider).toHaveBeenCalledWith("auto");
    expect(assistant_kernel.specs).toHaveLength(1);
  });

  it("ask: gives up rather than running an unresolvable provider", async () => {
    const { registry, stores, rag_store, assistant_kernel } = create_harness();
    rag_store.set_mode("agent");
    stores.ui.editor_settings.ai_default_provider_id = "auto";
    assistant_kernel.resolve_provider.mockResolvedValue(null);

    await registry.execute(ACTION_IDS.rag_ask, "organize my notes");

    expect(assistant_kernel.specs).toHaveLength(0);
    expect(toast.error).toHaveBeenCalledWith("No AI provider configured");
  });

  it("set_mode: switches the session mode to agent", async () => {
    const { registry, rag_store } = create_harness();

    await registry.execute(ACTION_IDS.rag_set_mode, "agent");

    expect(rag_store.mode).toBe("agent");
  });

  it("set_mode: refuses agent mode when AI is disabled", async () => {
    const { registry, stores, rag_store } = create_harness();
    stores.ui.editor_settings.ai_enabled = false;

    await registry.execute(ACTION_IDS.rag_set_mode, "agent");

    expect(rag_store.mode).toBe("ask");
    expect(toast.info).toHaveBeenCalledWith(
      "AI Assistant is disabled in settings",
    );
  });

  it("ask in agent mode: does nothing when AI is disabled", async () => {
    const { registry, stores, rag_store, assistant_kernel } = create_harness();
    rag_store.set_mode("agent");
    stores.ui.editor_settings.ai_enabled = false;

    await registry.execute(ACTION_IDS.rag_ask, "organize my notes");

    expect(assistant_kernel.specs).toHaveLength(0);
    expect(toast.info).toHaveBeenCalledWith(
      "AI Assistant is disabled in settings",
    );
  });

  it("ask in agent mode: refuses text-only CLI providers with a toast", async () => {
    const { registry, stores, rag_store, assistant_kernel } = create_harness();
    rag_store.set_mode("agent");
    stores.ui.editor_settings.ai_default_provider_id = "ollama";

    await registry.execute(ACTION_IDS.rag_ask, "organize my notes");

    expect(assistant_kernel.specs).toHaveLength(0);
    expect(toast.error).toHaveBeenCalledWith(
      "Ollama does not support agent mode",
    );
    expect(rag_store.messages).toEqual([]);
  });

  it("ask in agent mode: runs the agent turn and records the reply", async () => {
    const { registry, rag_store, assistant_kernel, git_service, stores } =
      create_harness();
    rag_store.set_mode("agent");

    await registry.execute(ACTION_IDS.rag_ask, "organize my notes");

    expect(git_service.create_checkpoint).toHaveBeenCalledTimes(1);
    expect(agent_spec(assistant_kernel.specs)).toMatchObject({
      kind: "agent",
      prompt: "organize my notes",
      toolset: { kind: "read_only" },
    });
    expect(rag_store.messages.map((m) => m.role)).toEqual([
      "user",
      "assistant",
    ]);
    expect(rag_store.messages[1]?.content).toBe("All organized.");
    expect(rag_store.active?.agent_session_id).toBe("sess-1");
    expect(stores.op.get("rag.ask").status).toBe("success");
  });

  it("ask in agent mode: routes the claude provider to the harness backend", async () => {
    const { registry, rag_store, assistant_kernel } = create_harness();
    rag_store.set_mode("agent");

    await registry.execute(ACTION_IDS.rag_ask, "organize my notes");

    expect(assistant_kernel.specs).toHaveLength(1);
    expect(agent_spec(assistant_kernel.specs).backend).toBe("harness");
  });

  it("ask in agent mode: routes api providers to the native backend", async () => {
    const { registry, stores, rag_store, assistant_kernel } = create_harness();
    rag_store.set_mode("agent");
    stores.ui.editor_settings.ai_default_provider_id = "lmstudio";

    await registry.execute(ACTION_IDS.rag_ask, "organize my notes");

    expect(assistant_kernel.specs).toHaveLength(1);
    expect(agent_spec(assistant_kernel.specs).backend).toBe("native");
    expect(stores.op.get("rag.ask").status).toBe("success");
  });

  it("native agent run: streams tool events and completes coherently", async () => {
    const events: RunEvent[] = [
      { type: "session", provider_session_id: "native-sess" },
      {
        type: "tool_start",
        name: "mcp__carbide__create_note",
        input_summary: '{"path":"notes/new.md"}',
        paths: ["notes/new.md"],
        mutating: true,
      },
      { type: "tool_end", name: "mcp__carbide__create_note", ok: true },
      { type: "text", text: "Created the note." },
      { type: "done", stats: { num_turns: 2 } },
    ];
    const {
      registry,
      stores,
      rag_store,
      rag_service,
      assistant_kernel,
      git_service,
    } = create_harness(events);
    register_refresh_tree(registry);
    rag_store.set_mode("agent");
    stores.ui.editor_settings.ai_default_provider_id = "lmstudio";

    await registry.execute(ACTION_IDS.rag_ask, "create a note");

    expect(git_service.create_checkpoint).toHaveBeenCalledTimes(1);
    expect(agent_spec(assistant_kernel.specs)).toMatchObject({
      prompt: "create a note",
      toolset: { kind: "read_only" },
      backend: "native",
    });
    expect(rag_store.messages.map((m) => m.role)).toEqual([
      "user",
      "assistant",
    ]);
    expect(rag_store.messages[1]?.content).toBe("Created the note.");
    expect(rag_store.active?.agent_session_id).toBe("native-sess");
    expect(rag_store.active?.changed_files).toEqual(["notes/new.md"]);
    expect(rag_service.save_session).toHaveBeenCalled();
    expect(stores.op.get("rag.ask").status).toBe("success");
  });

  it("set_permission_mode: updates the store and active session", async () => {
    const { registry, rag_store } = create_harness();
    rag_store.set_mode("agent");
    rag_store.add_user_message("hi");

    await registry.execute(ACTION_IDS.rag_set_permission_mode, "power");

    expect(rag_store.permission_mode).toBe("power");
    expect(rag_store.active?.permission_mode).toBe("power");
  });

  it("new_chat: seeds permission_mode from the configured default", async () => {
    const { registry, stores, rag_store } = create_harness();
    stores.ui.editor_settings.ai_agent_permission_default = "power";
    rag_store.set_permission_mode("safe");

    await registry.execute(ACTION_IDS.rag_new_chat);

    expect(rag_store.permission_mode).toBe("power");
  });

  it("agent_abort: is a no-op when nothing is running", async () => {
    const { registry } = create_harness();

    await expect(
      registry.execute(ACTION_IDS.rag_agent_abort),
    ).resolves.not.toThrow();
  });

  // The harness CLI edits disk directly, so nothing but this sync tells the
  // editor its buffer went stale.
  it("agent write to the open clean note reloads the editor buffer", async () => {
    const { registry, stores, rag_store, note_service, editor_service } =
      create_harness(agent_write_events(["/vault/demo/notes/open.md"]), {
        open_note: { meta: { path: "notes/open.md" }, is_dirty: false },
      });
    register_refresh_tree(registry);
    rag_store.set_mode("agent");

    await registry.execute(ACTION_IDS.rag_ask, "rewrite the open note");

    expect(rag_store.active?.changed_files).toEqual(["notes/open.md"]);
    expect(stores.tab.invalidate_cache_by_path).toHaveBeenCalledWith(
      "notes/open.md",
    );
    expect(editor_service.close_buffer).toHaveBeenCalledWith("notes/open.md");
    expect(note_service.open_note).toHaveBeenCalledWith(
      "notes/open.md",
      false,
      {
        force_reload: true,
        cleanup_if_missing: true,
      },
    );
  });

  it("agent write to a dirty open note surfaces a conflict instead of reloading", async () => {
    const { registry, rag_store, note_service, tab_service } = create_harness(
      agent_write_events(["/vault/demo/notes/open.md"]),
      { open_note: { meta: { path: "notes/open.md" }, is_dirty: true } },
    );
    register_refresh_tree(registry);
    rag_store.set_mode("agent");

    await registry.execute(ACTION_IDS.rag_ask, "rewrite the open note");

    expect(tab_service.mark_conflict).toHaveBeenCalledWith("notes/open.md");
    expect(note_service.open_note).not.toHaveBeenCalled();
  });

  it("agent write to a note open in a background tab invalidates its cache", async () => {
    const { registry, rag_store, note_service, tab_service } = create_harness(
      agent_write_events(["/vault/demo/notes/other.md"]),
      {
        open_note: { meta: { path: "notes/open.md" }, is_dirty: false },
        background_tab: { id: "bg-tab", is_dirty: false },
      },
    );
    register_refresh_tree(registry);
    rag_store.set_mode("agent");

    await registry.execute(ACTION_IDS.rag_ask, "rewrite another note");

    expect(tab_service.invalidate_cache).toHaveBeenCalledWith("notes/other.md");
    expect(note_service.open_note).not.toHaveBeenCalled();
  });

  // delete_note and rename_note are mutating, so a "changed" path can be one
  // that no longer exists — reloading it would fail the open and strand the tab.
  it("agent delete of the open note clears the buffer and removes the tab", async () => {
    const { registry, rag_store, note_service, tab_service, editor_service } =
      create_harness(agent_delete_events("notes/open.md"), {
        open_note: { meta: { path: "notes/open.md" }, is_dirty: false },
      });
    register_refresh_tree(registry);
    note_service.open_note.mockResolvedValue({ status: "not_found" });
    rag_store.set_mode("agent");

    await registry.execute(ACTION_IDS.rag_ask, "delete the open note");

    expect(editor_service.close_buffer).toHaveBeenCalledWith("notes/open.md");
    expect(note_service.open_note).toHaveBeenCalledWith(
      "notes/open.md",
      false,
      {
        force_reload: true,
        cleanup_if_missing: true,
      },
    );
    expect(note_service.clear_open_note).toHaveBeenCalledTimes(1);
    expect(tab_service.remove_tab).toHaveBeenCalledWith("notes/open.md");
  });

  it("a surviving note is reloaded, not cleared", async () => {
    const { registry, rag_store, note_service, tab_service } = create_harness(
      agent_write_events(["/vault/demo/notes/open.md"]),
      { open_note: { meta: { path: "notes/open.md" }, is_dirty: false } },
    );
    register_refresh_tree(registry);
    rag_store.set_mode("agent");

    await registry.execute(ACTION_IDS.rag_ask, "rewrite the open note");

    expect(note_service.clear_open_note).not.toHaveBeenCalled();
    expect(tab_service.remove_tab).not.toHaveBeenCalled();
  });

  it("agent write to a note nobody has open only refreshes the tree", async () => {
    const { registry, rag_store, note_service, tab_service } = create_harness(
      agent_write_events(["/vault/demo/notes/fresh.md"]),
    );
    const refresh = register_refresh_tree(registry);
    rag_store.set_mode("agent");

    await registry.execute(ACTION_IDS.rag_ask, "make a new note");

    expect(rag_store.active?.changed_files).toEqual(["notes/fresh.md"]);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(note_service.open_note).not.toHaveBeenCalled();
    expect(tab_service.mark_conflict).not.toHaveBeenCalled();
    expect(tab_service.invalidate_cache).not.toHaveBeenCalled();
  });
});
