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
    ai_service.execute = vi.fn().mockResolvedValue({
      success: true,
      output: "# Updated",
      error: null,
    });

    await registry.execute(ACTION_IDS.ai_open_assistant);
    expect(ai_store.dialog.cli_status).toBe("unknown");

    await registry.execute(ACTION_IDS.ai_update_prompt, "Tighten this note");
    await registry.execute(ACTION_IDS.ai_execute);

    expect(ai_service.execute).toHaveBeenCalled();
    expect(ai_store.dialog.result?.success).toBe(true);
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
          signal: expect.any(AbortSignal),
        }),
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

    it("routes {output_file} providers through the blocking execute path", async () => {
      const { registry, stores, ai_service } = create_harness();
      stores.ui.editor_settings.ai_default_provider_id = "codex";
      ai_service.execute = vi.fn().mockResolvedValue({
        success: true,
        output: "# Blocking",
        error: null,
      });

      await registry.execute(ACTION_IDS.ai_open_assistant);
      await registry.execute(ACTION_IDS.ai_update_prompt, "Tighten this note");
      await registry.execute(ACTION_IDS.ai_execute);

      expect(ai_service.execute).toHaveBeenCalled();
      expect(ai_service.execute_streaming).not.toHaveBeenCalled();
    });

    it("surfaces streamed partial text on the dialog while executing", async () => {
      const { registry, ai_store, ai_service } = create_harness();
      let seen_streaming_text: string | null = null;
      ai_service.execute_streaming = vi.fn(
        async (
          _input: unknown,
          on_chunk?: (partial: string) => void,
        ) => {
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
        async (
          _input: unknown,
          on_chunk?: (partial: string) => void,
        ) => {
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

    it("aborts the stream when the menu closes midway", async () => {
      const { registry, view, ai_service } = setup_inline();
      let release!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      let captured_signal: AbortSignal | undefined;
      ai_service.stream_inline = vi.fn(async function* (input: {
        signal?: AbortSignal;
      }) {
        captured_signal = input.signal;
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

      expect(captured_signal?.aborted).toBe(true);
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
        "No streaming-capable AI provider available",
      );
    });
  });
});
