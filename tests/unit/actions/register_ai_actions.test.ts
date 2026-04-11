import { describe, expect, it, vi } from "vitest";
import { ActionRegistry } from "$lib/app/action_registry/action_registry";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import { register_ai_actions } from "$lib/features/ai/application/ai_actions";
import { AiStore } from "$lib/features/ai/state/ai_store.svelte";
import { UIStore } from "$lib/app/orchestration/ui_store.svelte";
import { VaultStore } from "$lib/features/vault/state/vault_store.svelte";
import { NotesStore } from "$lib/features/note/state/note_store.svelte";
import { EditorStore } from "$lib/features/editor/state/editor_store.svelte";
import { OpStore } from "$lib/app/orchestration/op_store.svelte";
import { SearchStore } from "$lib/features/search/state/search_store.svelte";
import { TabStore } from "$lib/features/tab/state/tab_store.svelte";
import { GitStore } from "$lib/features/git/state/git_store.svelte";
import { GraphStore } from "$lib/features/graph";
import { BasesStore } from "$lib/features/bases/state/bases_store.svelte";
import { TaskStore } from "$lib/features/task/state/task_store.svelte";
import { OutlineStore } from "$lib/features/outline";
import { ParsedNoteCache } from "$lib/features/note/state/parsed_note_cache.svelte";
import { ReferenceStore } from "$lib/features/reference/state/reference_store.svelte";
import { as_markdown_text, as_note_path } from "$lib/shared/types/ids";
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

function create_harness() {
  const registry = new ActionRegistry();
  const stores = {
    ui: new UIStore(),
    vault: new VaultStore(),
    notes: new NotesStore(),
    editor: new EditorStore(),
    op: new OpStore(),
    search: new SearchStore(),
    tab: new TabStore(),
    git: new GitStore(),
    graph: new GraphStore(),
    bases: new BasesStore(),
    task: new TaskStore(),
    outline: new OutlineStore(),
    parsed_note_cache: new ParsedNoteCache(),
    reference: new ReferenceStore(),
  };
  const ai_store = new AiStore();
  const services = {
    vault: {},
    note: {},
    folder: {},
    settings: {},
    search: {},
    editor: {
      get_ai_context: vi.fn().mockReturnValue({
        note_path: as_note_path("docs/demo.md"),
        note_title: "demo",
        markdown: as_markdown_text("# Demo"),
        selection: null,
      }),
      apply_ai_output: vi.fn().mockReturnValue(true),
    },
    clipboard: {},
    shell: {},
    tab: {},
    git: {},
    hotkey: {},
    theme: {},
    reference: {} as any,
  };
  const ai_service = {
    check_availability: vi.fn().mockResolvedValue(true),
    execute: vi.fn(),
  };

  stores.ui.editor_settings.ai_providers = BUILTIN_PROVIDER_PRESETS;
  stores.ui.editor_settings.ai_default_provider_id = "auto";

  register_ai_actions({
    registry,
    stores,
    services: services as never,
    default_mount_config: {
      reset_app_state: true,
      bootstrap_default_vault_path: null,
    },
    ai_store,
    ai_service: ai_service as never,
  });

  return { registry, stores, services, ai_store, ai_service };
}

describe("register_ai_actions", () => {
  it("does not open or execute AI when AI is disabled", async () => {
    const { registry, stores, ai_store, ai_service } = create_harness();
    stores.ui.editor_settings.ai_enabled = false;

    await registry.execute(ACTION_IDS.ai_open_assistant);
    await registry.execute(ACTION_IDS.ai_execute);

    expect(ai_store.dialog.open).toBe(false);
    expect(stores.ui.context_rail_open).toBe(false);
    expect(ai_service.check_availability).not.toHaveBeenCalled();
    expect(ai_service.execute).not.toHaveBeenCalled();
    expect(toast.info).toHaveBeenCalledWith(
      "AI Assistant is disabled in settings",
    );
  });

  it("opens the AI assistant inside the context rail", async () => {
    const { registry, stores, ai_store, ai_service } = create_harness();

    await registry.execute(ACTION_IDS.ai_open_assistant);

    expect(stores.ui.context_rail_open).toBe(true);
    expect(stores.ui.context_rail_tab).toBe("ai");
    expect(ai_store.dialog.open).toBe(true);
    expect(ai_service.check_availability).toHaveBeenCalledWith(
      expect.objectContaining({ id: "claude" }),
    );
  });

  it("uses the configured default provider for new sessions", async () => {
    const { registry, stores, ai_store, ai_service } = create_harness();
    stores.ui.editor_settings.ai_default_provider_id = "codex";

    await registry.execute(ACTION_IDS.ai_open_assistant);

    expect(ai_store.dialog.provider_id).toBe("codex");
    expect(ai_service.check_availability).toHaveBeenCalledWith(
      expect.objectContaining({ id: "codex" }),
    );
  });

  it("auto-selects the first available provider", async () => {
    const { registry, ai_store, ai_service } = create_harness();
    ai_service.check_availability = vi
      .fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    await registry.execute(ACTION_IDS.ai_open_assistant);

    expect(ai_store.dialog.provider_id).toBe("codex");
    expect(ai_store.dialog.cli_status).toBe("available");
    expect(ai_service.check_availability).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ id: "claude" }),
    );
    expect(ai_service.check_availability).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ id: "codex" }),
    );
  });

  it("shows a generic setup error when auto-select cannot find any provider", async () => {
    const { registry, ai_store, ai_service } = create_harness();
    ai_service.check_availability = vi.fn().mockResolvedValue(false);

    await registry.execute(ACTION_IDS.ai_open_assistant);

    expect(ai_store.dialog.provider_id).toBe("claude");
    expect(ai_store.dialog.cli_status).toBe("error");
    expect(ai_store.dialog.cli_error).toContain("No configured AI backend");
  });

  it("updates the active provider from the assistant surface", async () => {
    const { registry, ai_store, ai_service } = create_harness();

    await registry.execute(ACTION_IDS.ai_open_assistant);
    await registry.execute(ACTION_IDS.ai_update_provider, "ollama");

    expect(ai_store.dialog.provider_id).toBe("ollama");
    expect(ai_service.check_availability).toHaveBeenCalledWith(
      expect.objectContaining({ id: "ollama" }),
    );
  });

  it("updates the active scope when a selection is available", async () => {
    const { registry, ai_store, services } = create_harness();
    services.editor.get_ai_context = vi.fn().mockReturnValue({
      note_path: as_note_path("docs/demo.md"),
      note_title: "demo",
      markdown: as_markdown_text("# Demo"),
      selection: {
        text: "Demo",
        start: 2,
        end: 6,
      },
    });

    await registry.execute(ACTION_IDS.ai_open_assistant);
    await registry.execute(ACTION_IDS.ai_update_target, "selection");

    expect(ai_store.dialog.context?.target).toBe("selection");
  });

  it("updates the session context when the AI panel is already open", async () => {
    const { registry, ai_store, services } = create_harness();

    await registry.execute(ACTION_IDS.ai_open_assistant);

    const next_context = {
      note_path: as_note_path("docs/demo.md"),
      note_title: "demo",
      note_markdown: as_markdown_text("# New Content"),
      selection: {
        text: "Content",
        start: 6,
        end: 13,
      },
      target: "selection" as const,
    };

    await registry.execute(ACTION_IDS.ai_update_context, next_context);

    expect(ai_store.dialog.context?.note_markdown).toBe("# New Content");
    expect(ai_store.dialog.context?.selection?.text).toBe("Content");
  });

  it("records turns as assistant executions complete", async () => {
    const { registry, ai_store, ai_service } = create_harness();
    ai_service.execute = vi.fn().mockResolvedValue({
      success: true,
      output: "# Updated",
      error: null,
    });

    await registry.execute(ACTION_IDS.ai_open_assistant);
    await registry.execute(ACTION_IDS.ai_update_prompt, "Tighten this note");
    await registry.execute(ACTION_IDS.ai_execute);

    expect(ai_store.dialog.turns).toHaveLength(1);
    expect(ai_store.dialog.turns[0]).toMatchObject({
      prompt: "Tighten this note",
      status: "completed",
      result: { success: true, output: "# Updated", error: null },
    });
  });

  it("reopens the rail without resetting the current note session", async () => {
    const { registry, stores, ai_store, ai_service } = create_harness();
    ai_service.execute = vi.fn().mockResolvedValue({
      success: true,
      output: "# Updated",
      error: null,
    });

    await registry.execute(ACTION_IDS.ai_open_assistant);
    await registry.execute(ACTION_IDS.ai_update_prompt, "Tighten this note");
    await registry.execute(ACTION_IDS.ai_execute);

    stores.ui.toggle_context_rail();
    await registry.execute(ACTION_IDS.ai_open_assistant);

    expect(stores.ui.context_rail_open).toBe(true);
    expect(stores.ui.context_rail_tab).toBe("ai");
    expect(ai_store.dialog.prompt).toBe("Tighten this note");
    expect(ai_store.dialog.turns).toHaveLength(1);
    expect(ai_store.dialog.result).toEqual({
      success: true,
      output: "# Updated",
      error: null,
    });
    expect(ai_service.check_availability).toHaveBeenCalledTimes(1);
  });

  it("resets the AI session and closes the AI panel", async () => {
    const { registry, stores, ai_store } = create_harness();

    await registry.execute(ACTION_IDS.ai_open_assistant);
    await registry.execute(ACTION_IDS.ai_close_dialog);

    expect(ai_store.dialog.open).toBe(false);
    expect(ai_store.dialog.context).toBeNull();
    expect(stores.ui.context_rail_open).toBe(false);
  });

  it("applies a partial draft when the assistant provides an output override", async () => {
    const { registry, services, ai_service } = create_harness();
    ai_service.execute = vi.fn().mockResolvedValue({
      success: true,
      output: "# Updated\nLine 2\nLine 3",
      error: null,
    });

    await registry.execute(ACTION_IDS.ai_open_assistant);
    await registry.execute(ACTION_IDS.ai_update_prompt, "Refine this note");
    await registry.execute(ACTION_IDS.ai_execute);
    await registry.execute(ACTION_IDS.ai_apply_result, "# Updated\nLine 2");

    expect(services.editor.apply_ai_output).toHaveBeenCalledWith(
      "full_note",
      "# Updated\nLine 2",
      null,
    );
  });
});
