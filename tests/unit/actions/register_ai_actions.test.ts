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
import { OutlineStore } from "$lib/features/outline";
import { SplitViewStore } from "$lib/features/split_view";
import { as_markdown_text, as_note_path } from "$lib/shared/types/ids";
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
    outline: new OutlineStore(),
    split_view: new SplitViewStore(),
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
  };
  const ai_service = {
    check_cli: vi.fn().mockResolvedValue(true),
    execute: vi.fn(),
  };

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
    expect(ai_service.check_cli).not.toHaveBeenCalled();
    expect(ai_service.execute).not.toHaveBeenCalled();
    expect(toast.info).toHaveBeenCalledWith(
      "AI Assistant is disabled in settings",
    );
  });

  it("updates the active provider from the assistant surface", async () => {
    const { registry, ai_store, ai_service } = create_harness();

    await registry.execute(ACTION_IDS.ai_open_assistant);
    await registry.execute(ACTION_IDS.ai_update_provider, "ollama");

    expect(ai_store.dialog.provider).toBe("ollama");
    expect(ai_service.check_cli).toHaveBeenCalledWith("ollama", "ollama");
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
});
