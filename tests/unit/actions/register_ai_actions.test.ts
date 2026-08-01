import { describe, expect, it, vi } from "vitest";
import { Schema } from "prosemirror-model";
import {
  EditorState,
  TextSelection,
  type Transaction,
} from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import {
  create_ai_menu_plugin,
  get_ai_menu_state,
} from "$lib/features/editor/adapters/ai_menu_plugin";
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
import {
  as_markdown_text,
  as_note_path,
  as_vault_id,
} from "$lib/shared/types/ids";
import { create_test_vault } from "../helpers/test_fixtures";
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
      get_editor_view: vi.fn().mockReturnValue(null),
    },
    document: {
      get_document_ai_context: vi.fn().mockReturnValue(null),
      apply_document_ai_output: vi.fn().mockReturnValue(true),
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
    detect: vi.fn().mockResolvedValue(probe("present")),
    execute: vi.fn(),
    execute_streaming: vi.fn(),
    stream_inline: vi.fn(),
    build_execution_prompt: vi
      .fn()
      .mockResolvedValue({ prompt: "PROMPT", working_path: "docs/demo.md" }),
    fetch_vault_context: vi.fn().mockResolvedValue({
      similar_notes: [],
      backlinks: [],
      outlinks: [],
    }),
  };
  const agentic_runner = { run: vi.fn() };
  const ai_history = {
    load_history: vi.fn().mockResolvedValue([]),
    save_history: vi.fn().mockResolvedValue(undefined),
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
    ai_history,
    agentic_runner: agentic_runner as never,
  });

  return {
    registry,
    stores,
    services,
    ai_store,
    ai_service,
    ai_history,
    agentic_runner,
  };
}

function probe(status: "present" | "missing" | "unknown") {
  return { status, resolved_path: null, version: null, error: null };
}

describe("register_ai_actions", () => {
  it("does not open or execute AI when AI is disabled", async () => {
    const { registry, stores, ai_store, ai_service } = create_harness();
    stores.ui.editor_settings.ai_enabled = false;

    await registry.execute(ACTION_IDS.ai_open_assistant);
    await registry.execute(ACTION_IDS.ai_execute);

    expect(ai_store.dialog.open).toBe(false);
    expect(stores.ui.bottom_panel_open).toBe(false);
    expect(ai_service.detect).not.toHaveBeenCalled();
    expect(ai_service.execute).not.toHaveBeenCalled();
    expect(toast.info).toHaveBeenCalledWith(
      "AI Assistant is disabled in settings",
    );
  });

  it("opens the AI assistant in the bottom panel", async () => {
    const { registry, stores, ai_store, ai_service } = create_harness();

    await registry.execute(ACTION_IDS.ai_open_assistant);

    expect(stores.ui.bottom_panel_open).toBe(true);
    expect(stores.ui.bottom_panel_tab).toBe("ai");
    expect(ai_store.dialog.open).toBe(true);
    expect(ai_service.detect).toHaveBeenCalledWith(
      expect.objectContaining({ id: "claude" }),
    );
  });

  it("uses the configured default provider for new sessions", async () => {
    const { registry, stores, ai_store, ai_service } = create_harness();
    stores.ui.editor_settings.ai_default_provider_id = "codex";

    await registry.execute(ACTION_IDS.ai_open_assistant);

    expect(ai_store.dialog.provider_id).toBe("codex");
    expect(ai_service.detect).toHaveBeenCalledWith(
      expect.objectContaining({ id: "codex" }),
    );
  });

  it("auto-selects the first available provider", async () => {
    const { registry, ai_store, ai_service } = create_harness();
    ai_service.detect = vi
      .fn()
      .mockResolvedValueOnce(probe("missing"))
      .mockResolvedValueOnce(probe("present"));

    await registry.execute(ACTION_IDS.ai_open_assistant);

    expect(ai_store.dialog.provider_id).toBe("codex");
    expect(ai_store.dialog.cli_status).toBe("available");
    expect(ai_service.detect).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ id: "claude" }),
    );
    expect(ai_service.detect).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ id: "codex" }),
    );
  });

  it("shows a generic setup error when auto-select cannot find any provider", async () => {
    const { registry, ai_store, ai_service } = create_harness();
    ai_service.detect = vi.fn().mockResolvedValue(probe("missing"));

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
    expect(ai_service.detect).toHaveBeenCalledWith(
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
      kind: "note" as const,
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

    const ctx = ai_store.dialog.context;
    expect(ctx?.kind).toBe("note");
    if (ctx?.kind === "note") {
      expect(ctx.note_markdown).toBe("# New Content");
      expect(ctx.selection?.text).toBe("Content");
    }
  });

  it("records turns as assistant executions complete", async () => {
    const { registry, ai_store, ai_service } = create_harness();
    ai_service.execute_streaming = vi.fn().mockResolvedValue({
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

  it("swallows history persist failures without rejecting", async () => {
    const { registry, stores, ai_store, ai_service, ai_history } =
      create_harness();
    stores.vault.set_vault(create_test_vault());
    ai_service.execute_streaming = vi.fn().mockResolvedValue({
      success: true,
      output: "# Updated",
      error: null,
    });
    ai_history.save_history = vi
      .fn()
      .mockRejectedValue(new Error("cannot write to .carbide/ in browse mode"));

    await registry.execute(ACTION_IDS.ai_open_assistant);
    await registry.execute(ACTION_IDS.ai_update_prompt, "Tighten this note");
    await registry.execute(ACTION_IDS.ai_execute);
    await Promise.resolve();
    await Promise.resolve();

    expect(ai_history.save_history).toHaveBeenCalledWith("vault-1", [
      expect.objectContaining({ status: "completed" }),
    ]);
    expect(ai_store.dialog.turns[0]?.status).toBe("completed");
  });

  it("abandons a mid-flight execution when the vault switches", async () => {
    const { registry, stores, ai_store, ai_service, ai_history } =
      create_harness();
    stores.vault.set_vault(create_test_vault());
    let resolve_exec!: (result: {
      success: boolean;
      output: string;
      error: string | null;
    }) => void;
    ai_service.execute_streaming = vi.fn().mockReturnValue(
      new Promise((resolve) => {
        resolve_exec = resolve;
      }),
    );

    await registry.execute(ACTION_IDS.ai_open_assistant);
    await registry.execute(ACTION_IDS.ai_update_prompt, "Slow question");
    const exec = registry.execute(ACTION_IDS.ai_execute);

    stores.vault.set_vault(
      create_test_vault({ id: as_vault_id("vault-2"), name: "Other Vault" }),
    );
    const other_vault_turn = {
      id: 1,
      provider_id: "claude",
      target: "full_note" as const,
      mode: "ask" as const,
      prompt: "other vault question",
      status: "completed" as const,
      result: { success: true, output: "other vault answer", error: null },
    };
    ai_store.hydrate_turns([other_vault_turn]);

    resolve_exec({ success: true, output: "# From vault A", error: null });
    await exec;

    expect(ai_store.dialog.is_executing).toBe(false);
    expect(ai_store.dialog.turns).toHaveLength(1);
    expect(ai_store.dialog.turns[0]).toMatchObject(other_vault_turn);
    expect(ai_history.save_history).not.toHaveBeenCalled();
  });

  it("reopens the bottom panel without resetting the current note session", async () => {
    const { registry, stores, ai_store, ai_service } = create_harness();
    ai_service.execute_streaming = vi.fn().mockResolvedValue({
      success: true,
      output: "# Updated",
      error: null,
    });

    await registry.execute(ACTION_IDS.ai_open_assistant);
    await registry.execute(ACTION_IDS.ai_update_prompt, "Tighten this note");
    await registry.execute(ACTION_IDS.ai_execute);

    stores.ui.bottom_panel_open = false;
    await registry.execute(ACTION_IDS.ai_open_assistant);

    expect(stores.ui.bottom_panel_open).toBe(true);
    expect(stores.ui.bottom_panel_tab).toBe("ai");
    expect(ai_store.dialog.prompt).toBe("Tighten this note");
    expect(ai_store.dialog.turns).toHaveLength(1);
    expect(ai_store.dialog.result).toEqual({
      success: true,
      output: "# Updated",
      error: null,
    });
    expect(ai_service.detect).toHaveBeenCalledTimes(1);
  });

  it("preserves result and turns when switching providers", async () => {
    const { registry, ai_store, ai_service } = create_harness();
    ai_service.execute_streaming = vi.fn().mockResolvedValue({
      success: true,
      output: "# Updated",
      error: null,
    });

    await registry.execute(ACTION_IDS.ai_open_assistant);
    await registry.execute(ACTION_IDS.ai_update_prompt, "Tighten this note");
    await registry.execute(ACTION_IDS.ai_execute);

    expect(ai_store.dialog.result).toEqual({
      success: true,
      output: "# Updated",
      error: null,
    });
    expect(ai_store.dialog.turns).toHaveLength(1);

    await registry.execute(ACTION_IDS.ai_update_provider, "ollama");

    expect(ai_store.dialog.provider_id).toBe("ollama");
    expect(ai_store.dialog.result).toEqual({
      success: true,
      output: "# Updated",
      error: null,
    });
    expect(ai_store.dialog.turns).toHaveLength(1);
  });

  it("resets the AI session and closes the AI panel", async () => {
    const { registry, stores, ai_store } = create_harness();

    await registry.execute(ACTION_IDS.ai_open_assistant);
    await registry.execute(ACTION_IDS.ai_close_dialog);

    expect(ai_store.dialog.open).toBe(false);
    expect(ai_store.dialog.context).toBeNull();
    expect(stores.ui.bottom_panel_open).toBe(false);
  });

  it("applies a partial draft when the assistant provides an output override", async () => {
    const { registry, services, ai_service } = create_harness();
    ai_service.execute_streaming = vi.fn().mockResolvedValue({
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

  describe("document tab", () => {
    function open_document_tab(
      stores: ReturnType<typeof create_harness>["stores"],
      id = "tab-html",
    ) {
      stores.tab.set_dirty = vi.fn();
      Object.defineProperty(stores.tab, "active_tab", {
        configurable: true,
        get: () => ({ id, kind: "document" }),
      });
    }

    it("opens a document AI session when an html tab is active", async () => {
      const { registry, stores, services, ai_store } = create_harness();
      open_document_tab(stores);
      services.document.get_document_ai_context = vi.fn().mockReturnValue({
        tab_id: "tab-html",
        file_path: "notes/chart.html",
        file_title: "chart",
        content: "<p>x</p>",
      });

      await registry.execute(ACTION_IDS.ai_open_assistant);

      expect(services.document.get_document_ai_context).toHaveBeenCalledWith(
        "tab-html",
      );
      expect(ai_store.dialog.open).toBe(true);
      const ctx = ai_store.dialog.context;
      expect(ctx?.kind).toBe("document");
      if (ctx?.kind === "document") {
        expect(ctx.tab_id).toBe("tab-html");
        expect(ctx.file_title).toBe("chart");
        expect(ctx.content).toBe("<p>x</p>");
      }
      expect(ai_store.dialog.vault_context_enabled).toBe(false);
    });

    it("opens a document AI session when a text tab is active", async () => {
      const { registry, stores, services, ai_store } = create_harness();
      open_document_tab(stores, "tab-text");
      services.document.get_document_ai_context = vi.fn().mockReturnValue({
        tab_id: "tab-text",
        file_path: "scripts/build.py",
        file_title: "build",
        content: "print('x')",
      });

      await registry.execute(ACTION_IDS.ai_open_assistant);

      expect(services.document.get_document_ai_context).toHaveBeenCalledWith(
        "tab-text",
      );
      expect(ai_store.dialog.open).toBe(true);
      const ctx = ai_store.dialog.context;
      expect(ctx?.kind).toBe("document");
      if (ctx?.kind === "document") {
        expect(ctx.file_path).toBe("scripts/build.py");
        expect(ctx.content).toBe("print('x')");
      }
    });

    it("applies AI output through document_service and marks the tab dirty", async () => {
      const { registry, stores, services, ai_service } = create_harness();
      open_document_tab(stores);
      services.document.get_document_ai_context = vi.fn().mockReturnValue({
        tab_id: "tab-html",
        file_path: "notes/chart.html",
        file_title: "chart",
        content: "<p>x</p>",
      });
      ai_service.execute_streaming = vi.fn().mockResolvedValue({
        success: true,
        output: "<p>y</p>",
        error: null,
      });

      await registry.execute(ACTION_IDS.ai_open_assistant);
      await registry.execute(ACTION_IDS.ai_update_prompt, "Rewrite");
      await registry.execute(ACTION_IDS.ai_execute);
      await registry.execute(ACTION_IDS.ai_apply_result);

      expect(services.document.apply_document_ai_output).toHaveBeenCalledWith(
        "tab-html",
        "<p>y</p>",
      );
      expect(stores.tab.set_dirty).toHaveBeenCalledWith("tab-html", true);
      expect(services.editor.apply_ai_output).not.toHaveBeenCalled();
    });
  });

  it("executes with an unknown CLI status instead of silently ignoring the click", async () => {
    const { registry, stores, ai_store, ai_service } = create_harness();
    stores.ui.editor_settings.ai_default_provider_id = "codex";
    ai_service.detect = vi.fn().mockResolvedValue(probe("unknown"));
    ai_service.execute_streaming = vi.fn().mockResolvedValue({
      success: true,
      output: "# Updated",
      error: null,
    });

    await registry.execute(ACTION_IDS.ai_open_assistant);
    expect(ai_store.dialog.cli_status).toBe("unknown");

    await registry.execute(ACTION_IDS.ai_update_prompt, "Tighten this note");
    await registry.execute(ACTION_IDS.ai_execute);

    expect(ai_service.execute_streaming).toHaveBeenCalled();
    expect(ai_store.dialog.result?.success).toBe(true);
  });

  describe("agentic inline edit", () => {
    it("routes native-capable edit providers through the agentic runner and diff-applies the result", async () => {
      const {
        registry,
        stores,
        services,
        ai_store,
        ai_service,
        agentic_runner,
      } = create_harness();
      stores.vault.set_vault(create_test_vault());
      stores.ui.editor_settings.ai_default_provider_id = "lmstudio";
      agentic_runner.run = vi.fn().mockResolvedValue({
        success: true,
        output: "# Agentically edited",
        error: null,
      });

      await registry.execute(ACTION_IDS.ai_open_assistant);
      await registry.execute(ACTION_IDS.ai_update_prompt, "Improve the intro");
      await registry.execute(ACTION_IDS.ai_execute);

      expect(agentic_runner.run).toHaveBeenCalledWith(
        expect.objectContaining({
          provider_config: expect.objectContaining({ id: "lmstudio" }),
          vault_path: "/test/vault",
        }),
      );
      expect(ai_service.execute).not.toHaveBeenCalled();
      expect(ai_service.execute_streaming).not.toHaveBeenCalled();
      expect(ai_store.dialog.result).toEqual({
        success: true,
        output: "# Agentically edited",
        error: null,
      });

      await registry.execute(ACTION_IDS.ai_apply_result);
      expect(services.editor.apply_ai_output).toHaveBeenCalledWith(
        "full_note",
        "# Agentically edited",
        null,
      );
    });

    it("returns to idle without applying partial text when aborted mid-run", async () => {
      const { registry, stores, ai_store, agentic_runner } = create_harness();
      stores.vault.set_vault(create_test_vault());
      stores.ui.editor_settings.ai_default_provider_id = "lmstudio";
      agentic_runner.run = vi.fn(
        async (input: { on_text?: (partial: string) => void }) => {
          input.on_text?.("partial edit");
          await registry.execute(ACTION_IDS.ai_stop_execution);
          return { success: true, output: "partial edit", error: null };
        },
      );

      await registry.execute(ACTION_IDS.ai_open_assistant);
      await registry.execute(ACTION_IDS.ai_update_prompt, "Improve");
      await registry.execute(ACTION_IDS.ai_execute);

      expect(ai_store.dialog.is_executing).toBe(false);
      expect(ai_store.dialog.result).toBeNull();
      expect(ai_store.dialog.turns).toHaveLength(0);
    });

    it("keeps non-native providers on the existing streaming path", async () => {
      const { registry, ai_service, agentic_runner } = create_harness();
      ai_service.execute_streaming = vi.fn().mockResolvedValue({
        success: true,
        output: "# Updated",
        error: null,
      });

      await registry.execute(ACTION_IDS.ai_open_assistant);
      await registry.execute(ACTION_IDS.ai_update_prompt, "Tighten this note");
      await registry.execute(ACTION_IDS.ai_execute);

      expect(agentic_runner.run).not.toHaveBeenCalled();
      expect(ai_service.execute_streaming).toHaveBeenCalled();
    });
  });

  describe("panel streaming", () => {
    it("routes streaming-capable providers through execute_streaming", async () => {
      const { registry, ai_store, ai_service } = create_harness();
      ai_service.execute_streaming = vi.fn().mockResolvedValue({
        success: true,
        output: "# Streamed",
        error: null,
      });

      await registry.execute(ACTION_IDS.ai_open_assistant);
      await registry.execute(ACTION_IDS.ai_update_prompt, "Tighten this note");
      await registry.execute(ACTION_IDS.ai_execute);

      expect(ai_service.execute_streaming).toHaveBeenCalledWith(
        expect.objectContaining({
          provider_config: expect.objectContaining({ id: "claude" }),
          on_run_started: expect.any(Function),
        }),
        expect.any(Function),
        expect.any(Function),
      );
      expect(ai_service.execute).not.toHaveBeenCalled();
      expect(ai_store.dialog.result).toEqual({
        success: true,
        output: "# Streamed",
        error: null,
      });
      expect(ai_store.dialog.streaming_text).toBeNull();
    });

    // A {output_file} provider cannot stream, but it is still a kernel run: the
    // transport picks the blocking channel and Stop still reaches it. Before the
    // run kernel this path bypassed the kernel entirely and Stop was a no-op.
    it("routes {output_file} providers through the kernel too, so Stop works", async () => {
      const { registry, stores, ai_service } = create_harness();
      stores.ui.editor_settings.ai_default_provider_id = "codex";
      ai_service.execute_streaming = vi.fn().mockResolvedValue({
        success: true,
        output: "# Blocking",
        error: null,
      });

      await registry.execute(ACTION_IDS.ai_open_assistant);
      await registry.execute(ACTION_IDS.ai_update_prompt, "Tighten this note");
      await registry.execute(ACTION_IDS.ai_execute);

      expect(ai_service.execute_streaming).toHaveBeenCalledWith(
        expect.objectContaining({
          provider_config: expect.objectContaining({ id: "codex" }),
          on_run_started: expect.any(Function),
        }),
        expect.any(Function),
        expect.any(Function),
      );
      expect(ai_service.execute).not.toHaveBeenCalled();
    });

    it("surfaces streamed partial text on the dialog while executing", async () => {
      const { registry, ai_store, ai_service } = create_harness();
      let seen_streaming_text: string | null = null;
      ai_service.execute_streaming = vi.fn(
        async (_input: unknown, on_chunk?: (partial: string) => void) => {
          on_chunk?.("First chunk");
          seen_streaming_text = ai_store.dialog.streaming_text;
          return { success: true, output: "First chunk", error: null };
        },
      );

      await registry.execute(ACTION_IDS.ai_open_assistant);
      await registry.execute(ACTION_IDS.ai_update_prompt, "Tighten this note");
      await registry.execute(ACTION_IDS.ai_execute);

      expect(seen_streaming_text).toBe("First chunk");
      expect(ai_store.dialog.streaming_text).toBeNull();
    });

    it("keeps a stopped stream's partial text as a reviewable result", async () => {
      const { registry, ai_store, ai_service } = create_harness();
      ai_service.execute_streaming = vi.fn(
        async (_input: unknown, on_chunk?: (partial: string) => void) => {
          on_chunk?.("Partial answer");
          await registry.execute(ACTION_IDS.ai_stop_execution);
          return { success: true, output: "Partial answer", error: null };
        },
      );

      await registry.execute(ACTION_IDS.ai_open_assistant);
      await registry.execute(ACTION_IDS.ai_update_prompt, "Tighten this note");
      await registry.execute(ACTION_IDS.ai_execute);

      expect(ai_store.dialog.is_executing).toBe(false);
      expect(ai_store.dialog.result).toEqual({
        success: true,
        output: "Partial answer",
        error: null,
      });
    });

    it("dismisses a stopped stream that produced no output", async () => {
      const { registry, ai_store, ai_service } = create_harness();
      ai_service.execute_streaming = vi.fn(async () => {
        await registry.execute(ACTION_IDS.ai_stop_execution);
        return { success: true, output: "", error: null };
      });

      await registry.execute(ACTION_IDS.ai_open_assistant);
      await registry.execute(ACTION_IDS.ai_update_prompt, "Tighten this note");
      await registry.execute(ACTION_IDS.ai_execute);

      expect(ai_store.dialog.is_executing).toBe(false);
      expect(ai_store.dialog.result).toBeNull();
      expect(ai_store.dialog.turns).toHaveLength(0);
    });
  });

  describe("inline AI streaming", () => {
    function create_inline_view(text = "Hello world") {
      const schema = new Schema({
        nodes: {
          doc: { content: "block+" },
          paragraph: { group: "block", content: "inline*" },
          text: { group: "inline" },
        },
      });
      let state = EditorState.create({
        doc: schema.node("doc", null, [
          schema.node("paragraph", null, [schema.text(text)]),
        ]),
        plugins: [create_ai_menu_plugin()],
      });
      const view = {
        get state() {
          return state;
        },
        dispatch(tr: Transaction) {
          state = state.apply(tr);
        },
        coordsAtPos: vi.fn(() => ({
          left: 10,
          top: 20,
          right: 10,
          bottom: 40,
        })),
      };
      return view as unknown as EditorView;
    }

    function setup_inline(text?: string) {
      const harness = create_harness();
      const view = create_inline_view(text);
      harness.services.editor.get_editor_view = vi.fn().mockReturnValue(view);
      return { ...harness, view };
    }

    it("preserves partial output for review when the stream errors midway", async () => {
      const { registry, view, ai_service } = setup_inline();
      ai_service.stream_inline = vi.fn(function* () {
        yield { type: "text", text: "Partial draft" };
        yield { type: "error", error: "boom" };
      });

      await registry.execute(ACTION_IDS.ai_open_inline_menu);
      await registry.execute(ACTION_IDS.ai_execute_inline, {
        command_id: "continue",
      });

      const ps = get_ai_menu_state(view.state);
      expect(view.state.doc.textContent).toContain("Partial draft");
      expect(ps.open).toBe(true);
      expect(ps.streaming).toBe(false);
      expect(ps.mode).toBe("cursor_suggestion");
      expect(toast.error).toHaveBeenCalledWith("boom");
    });

    it("restores the original doc when the stream errors before any output", async () => {
      const { registry, view, ai_service } = setup_inline("Hello world");
      ai_service.stream_inline = vi.fn(function* () {
        yield { type: "error", error: "not signed in" };
      });

      view.dispatch(
        view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, 6)),
      );
      await registry.execute(ACTION_IDS.ai_open_inline_menu);
      await registry.execute(ACTION_IDS.ai_execute_inline, {
        command_id: "improve",
      });

      expect(view.state.doc.textContent).toBe("Hello world");
      expect(get_ai_menu_state(view.state).open).toBe(false);
      expect(toast.error).toHaveBeenCalledWith("not signed in");
    });

    it("starts only one stream when execute fires twice in a row", async () => {
      const { registry, ai_service } = setup_inline();
      ai_service.stream_inline = vi.fn(function* () {
        yield { type: "text", text: "once" };
      });

      await registry.execute(ACTION_IDS.ai_open_inline_menu);
      await Promise.all([
        registry.execute(ACTION_IDS.ai_execute_inline, {
          command_id: "continue",
        }),
        registry.execute(ACTION_IDS.ai_execute_inline, {
          command_id: "continue",
        }),
      ]);

      expect(ai_service.stream_inline).toHaveBeenCalledTimes(1);
    });

    // I2: run lifetime is independent of surface lifetime. Closing the menu
    // stops this surface consuming, but the run keeps going and stays
    // stoppable from the assistant popover.
    it("stops writing into the doc when the menu closes, without cancelling the run", async () => {
      const { registry, view, ai_service } = setup_inline();
      let release!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      let stopped = false;
      ai_service.stream_inline = vi.fn(async function* (input: {
        on_run_started?: (handle: { stop: () => void }) => void;
      }) {
        input.on_run_started?.({
          stop: () => {
            stopped = true;
          },
        });
        yield { type: "text", text: "partial" };
        await gate;
        yield { type: "text", text: "more" };
      });

      await registry.execute(ACTION_IDS.ai_open_inline_menu);
      const exec = registry.execute(ACTION_IDS.ai_execute_inline, {
        command_id: "continue",
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(view.state.doc.textContent).toContain("partial");

      await registry.execute(ACTION_IDS.ai_close_inline_menu);
      release();
      await exec;

      expect(stopped).toBe(false);
      expect(view.state.doc.textContent).not.toContain("more");
    });

    it("uses an API provider for inline AI when it is the default", async () => {
      const { registry, stores, ai_service } = setup_inline();
      stores.ui.editor_settings.ai_default_provider_id = "lmstudio";
      ai_service.stream_inline = vi.fn(function* () {
        yield { type: "text", text: "hi" };
      });

      await registry.execute(ACTION_IDS.ai_open_inline_menu);
      await registry.execute(ACTION_IDS.ai_execute_inline, {
        command_id: "continue",
      });

      expect(ai_service.stream_inline).toHaveBeenCalledWith(
        expect.objectContaining({
          provider_config: expect.objectContaining({ id: "lmstudio" }),
        }),
      );
    });

    it("rejects inline AI when the only provider cannot stream", async () => {
      const { registry, stores, ai_service } = setup_inline();
      stores.ui.editor_settings.ai_default_provider_id = "codex";

      await registry.execute(ACTION_IDS.ai_open_inline_menu);
      await registry.execute(ACTION_IDS.ai_execute_inline, {
        command_id: "continue",
      });

      expect(ai_service.stream_inline).not.toHaveBeenCalled();
      expect(toast.error).toHaveBeenCalledWith(
        "No streaming-capable AI provider — inline edits need a Claude/Ollama CLI or API provider (Codex is agent-only). Add or select one in Settings.",
      );
    });

    it("bails with a toast instead of opening when the cursor has no coords", async () => {
      const { registry, view } = setup_inline();
      (view as unknown as { coordsAtPos: () => never }).coordsAtPos = () => {
        throw new Error("no DOM at pos");
      };

      await registry.execute(ACTION_IDS.ai_open_inline_menu);

      expect(get_ai_menu_state(view.state).open).toBe(false);
      expect(toast.info).toHaveBeenCalledWith(
        "Place the cursor in the editor to use inline AI",
      );
    });

    describe("source view", () => {
      function make_source_view(
        coords: {
          left: number;
          top: number;
          bottom: number;
        } | null = { left: 50, top: 60, bottom: 80 },
        head = 6,
      ) {
        return {
          state: { selection: { main: { head } } },
          coordsAtPos: vi.fn(() => coords),
        } as unknown as import("@codemirror/view").EditorView;
      }

      function setup_source_inline() {
        const harness = setup_inline();
        harness.stores.editor.set_editor_mode("source");
        const source_view = make_source_view();
        harness.stores.editor.set_source_view_getter(() => source_view);
        return { ...harness, source_view };
      }

      it("anchors the menu from the CodeMirror cursor, not the hidden visual editor", async () => {
        const { registry, view, source_view } = setup_source_inline();

        await registry.execute(ACTION_IDS.ai_open_inline_menu);

        const ps = get_ai_menu_state(view.state);
        expect(ps.open).toBe(true);
        expect(ps.anchor_coords).toEqual({ left: 50, top: 60, bottom: 80 });
        expect(source_view.coordsAtPos).toHaveBeenCalledWith(6);
      });

      it("bails with a toast when no source view is registered", async () => {
        const { registry, stores, view } = setup_inline();
        stores.editor.set_editor_mode("source");

        await registry.execute(ACTION_IDS.ai_open_inline_menu);

        expect(get_ai_menu_state(view.state).open).toBe(false);
        expect(toast.info).toHaveBeenCalledWith(
          "Place the cursor in the editor to use inline AI",
        );
      });

      it("bails with a toast when the source cursor has no coords", async () => {
        const { registry, stores, view } = setup_inline();
        stores.editor.set_editor_mode("source");
        const source_view = make_source_view(null);
        stores.editor.set_source_view_getter(() => source_view);

        await registry.execute(ACTION_IDS.ai_open_inline_menu);

        expect(get_ai_menu_state(view.state).open).toBe(false);
        expect(toast.info).toHaveBeenCalledWith(
          "Place the cursor in the editor to use inline AI",
        );
      });

      it("applies the completed stream at the source cursor instead of the hidden visual doc", async () => {
        const { registry, stores, services, view, ai_service } =
          setup_source_inline();
        stores.editor.set_cursor_offset(6);
        services.editor.get_ai_context = vi.fn().mockReturnValue({
          note_path: as_note_path("docs/demo.md"),
          note_title: "demo",
          markdown: as_markdown_text("Hello source note"),
          selection: null,
        });
        ai_service.stream_inline = vi.fn(function* () {
          yield { type: "text", text: "AI " };
          yield { type: "text", text: "text" };
        });

        await registry.execute(ACTION_IDS.ai_open_inline_menu);
        await registry.execute(ACTION_IDS.ai_execute_inline, {
          command_id: "continue",
        });

        expect(services.editor.apply_ai_output).toHaveBeenCalledWith(
          "selection",
          "AI text",
          { text: "", start: 6, end: 6 },
        );
        expect(view.state.doc.textContent).toBe("Hello world");
        expect(get_ai_menu_state(view.state).open).toBe(false);
      });

      it("replaces the source selection when one exists", async () => {
        const { registry, services, ai_service } = setup_source_inline();
        services.editor.get_ai_context = vi.fn().mockReturnValue({
          note_path: as_note_path("docs/demo.md"),
          note_title: "demo",
          markdown: as_markdown_text("Hello source note"),
          selection: { text: "source", start: 6, end: 12 },
        });
        ai_service.stream_inline = vi.fn(function* () {
          yield { type: "text", text: "better" };
        });

        await registry.execute(ACTION_IDS.ai_open_inline_menu);
        await registry.execute(ACTION_IDS.ai_execute_inline, {
          command_id: "improve",
        });

        expect(services.editor.apply_ai_output).toHaveBeenCalledWith(
          "selection",
          "better",
          { text: "source", start: 6, end: 12 },
        );
      });

      it("discards output and closes the menu when the stream errors", async () => {
        const { registry, services, view, ai_service } = setup_source_inline();
        ai_service.stream_inline = vi.fn(function* () {
          yield { type: "text", text: "partial" };
          yield { type: "error", error: "boom" };
        });

        await registry.execute(ACTION_IDS.ai_open_inline_menu);
        await registry.execute(ACTION_IDS.ai_execute_inline, {
          command_id: "continue",
        });

        expect(services.editor.apply_ai_output).not.toHaveBeenCalled();
        expect(get_ai_menu_state(view.state).open).toBe(false);
        expect(toast.error).toHaveBeenCalledWith("boom");
      });
    });
  });
});
