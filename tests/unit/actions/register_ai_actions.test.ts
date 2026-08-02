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
import {
  AssistantProposalStore,
  AssistantSessionStore,
  type Proposal,
  type RunHandle,
  type RunOutcome,
} from "$lib/features/assistant";
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
    dismiss: vi.fn(),
  },
}));

// compute_note_revision is AU-030's to implement (NOT_IMPLEMENTED as of the
// C2 contract) — this lane calls it as contract surface (P1 ruling) but must
// not depend on its runtime behaviour, so it is faked here rather than left
// to throw.
vi.mock("$lib/features/assistant", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("$lib/features/assistant")>();
  return {
    ...actual,
    compute_note_revision: vi.fn(
      (text: string) => `rev-${String(text.length)}`,
    ),
  };
});

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
    note: {
      read_note: vi.fn().mockResolvedValue({
        meta: { title: "Demo" },
        markdown: as_markdown_text("---\ntags:\n  - notes\n---\nBody text"),
      }),
      write_note_indexed: vi.fn().mockResolvedValue(undefined),
    },
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
  const assistant_sessions = new AssistantSessionStore();
  const rag_service = {
    save_session: vi.fn().mockResolvedValue(undefined),
    delete_session: vi.fn().mockResolvedValue(undefined),
  };

  // Read paths are real and frozen; add() is AU-030's NOT_IMPLEMENTED
  // mutator (P1 ruling: contract surface, called for real, faked for tests).
  // Held as its own const (not read back off assistant_proposals.add) so
  // assertions bind to this function, not to a class-typed method slot —
  // referencing assistant_proposals.add directly triggers unbound-method
  // even though this override never touches `this`.
  const assistant_proposals = new AssistantProposalStore();
  const add_proposal = vi.fn((proposal: Proposal) => {
    assistant_proposals.proposals.push(proposal);
  });
  assistant_proposals.add = add_proposal;

  // assistant_accept_proposal is AU-030's action (assistant_actions.ts,
  // not mine to touch). This harness stub stands in for its checkpoint+write
  // behaviour so this file can assert *that* accept was dispatched and *what*
  // was accepted, without depending on AU-030's implementation.
  const accept_proposal = vi.fn((...args: unknown[]) => {
    const id = args[0];
    const proposal = assistant_proposals.proposals.find((p) => p.id === id);
    if (proposal) proposal.status = "applied";
  });
  registry.register({
    id: ACTION_IDS.assistant_accept_proposal,
    label: "Accept Proposal",
    execute: accept_proposal,
  });

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
    agentic_runner: agentic_runner as never,
    assistant_sessions,
    assistant_proposals,
    rag_service: rag_service as never,
  });

  return {
    registry,
    stores,
    services,
    ai_store,
    ai_service,
    agentic_runner,
    assistant_sessions,
    assistant_proposals,
    add_proposal,
    accept_proposal,
    rag_service,
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

  it("abandons a mid-flight execution when the vault switches", async () => {
    const { registry, stores, ai_store, ai_service } = create_harness();
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

  // Superseded: this used to assert ai_apply_result wrote the note directly
  // through services.editor.apply_ai_output. Under I5, a note-context apply
  // builds a Proposal from the (possibly overridden) draft and accepts it
  // through the proposal store instead — see "builds and accepts a proposal
  // from a note-context result" below, which is this scenario's replacement.
  it("builds and accepts a proposal when the assistant provides an output override", async () => {
    const {
      registry,
      services,
      ai_service,
      assistant_proposals,
      add_proposal,
      accept_proposal,
    } = create_harness();
    ai_service.execute_streaming = vi.fn().mockResolvedValue({
      success: true,
      output: "# Updated\nLine 2\nLine 3",
      error: null,
    });

    await registry.execute(ACTION_IDS.ai_open_assistant);
    await registry.execute(ACTION_IDS.ai_update_prompt, "Refine this note");
    await registry.execute(ACTION_IDS.ai_execute);
    await registry.execute(ACTION_IDS.ai_apply_result, "# Updated\nLine 2");

    expect(services.editor.apply_ai_output).not.toHaveBeenCalled();
    expect(add_proposal).toHaveBeenCalledTimes(1);
    const [proposal] = assistant_proposals.proposals;
    expect(proposal?.note_path).toBe("docs/demo.md");
    // accept_proposal (the harness stub for AU-030's action) already ran by
    // the time ai_apply_result's await resolves, so the proposal is applied.
    expect(proposal?.status).toBe("applied");
    expect(
      proposal?.hunks.flatMap((hunk) => hunk.lines).map((line) => line.kind),
    ).toContain("add");
    expect(accept_proposal).toHaveBeenCalledWith(proposal?.id);
  });

  it("does not create a proposal while a result is only being drafted or dismissed", async () => {
    const { registry, ai_service, add_proposal, accept_proposal } =
      create_harness();
    ai_service.execute_streaming = vi.fn().mockResolvedValue({
      success: true,
      output: "# Updated",
      error: null,
    });

    await registry.execute(ACTION_IDS.ai_open_assistant);
    await registry.execute(ACTION_IDS.ai_update_prompt, "Refine this note");
    await registry.execute(ACTION_IDS.ai_execute);
    expect(add_proposal).not.toHaveBeenCalled();

    await registry.execute(ACTION_IDS.ai_clear_result);
    expect(add_proposal).not.toHaveBeenCalled();
    expect(accept_proposal).not.toHaveBeenCalled();
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
    // The apply-time assertion is superseded: ai_apply_result no longer
    // writes through services.editor.apply_ai_output for a note-context
    // result (I5) — it builds and accepts a Proposal, same as the streaming
    // path (see "builds and accepts a proposal..." above). The routing
    // assertions above the apply step are unchanged and stay in this test.
    it("routes native-capable edit providers through the agentic runner and accepts a proposal for the result", async () => {
      const {
        registry,
        stores,
        services,
        ai_store,
        ai_service,
        agentic_runner,
        assistant_proposals,
        accept_proposal,
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
      expect(services.editor.apply_ai_output).not.toHaveBeenCalled();
      const [proposal] = assistant_proposals.proposals;
      expect(proposal?.note_path).toBe("docs/demo.md");
      expect(accept_proposal).toHaveBeenCalledWith(proposal?.id);
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

    describe("accepting logs a ⌁ session", () => {
      function only_session(store: AssistantSessionStore) {
        const [session, ...rest] = store.sessions;
        if (!session || rest.length > 0) {
          throw new Error(
            `expected exactly one logged session, got ${String(store.sessions.length)}`,
          );
        }
        return session;
      }

      function click_continue_in_chat() {
        const [call] = vi.mocked(toast.success).mock.calls;
        if (!call) throw new Error("no success toast was raised");
        const [message, options] = call;
        expect(message).toBe("Inline edit applied");
        const { action } = options as unknown as {
          action: { label: string; onClick: () => void };
        };
        expect(action.label).toBe("Continue in chat");
        action.onClick();
      }

      async function stream_and_accept(
        payload: { command_id?: string; prompt?: string } = {
          prompt: "make it sharper",
        },
        chunks = ["Sharper ", "prose"],
      ) {
        vi.mocked(toast.success).mockClear();
        const harness = setup_inline();
        harness.stores.vault.set_vault(create_test_vault());
        const opened: string[] = [];
        harness.registry.register({
          id: ACTION_IDS.assistant_open_session,
          label: "Open Assistant Session",
          execute: (...args: unknown[]) => {
            opened.push(String(args[0]));
          },
        });
        harness.ai_service.stream_inline = vi.fn(function* () {
          for (const text of chunks) yield { type: "text", text };
        });

        await harness.registry.execute(ACTION_IDS.ai_open_inline_menu);
        await harness.registry.execute(ACTION_IDS.ai_execute_inline, payload);
        await harness.registry.execute(ACTION_IDS.ai_accept_inline);

        return { ...harness, opened };
      }

      it("records the prompt and the accepted result as one inline session", async () => {
        const { assistant_sessions } = await stream_and_accept();

        const logged = only_session(assistant_sessions);
        expect(logged.kind).toBe("inline");
        expect(logged.title).toBe("make it sharper");
        expect(logged.title_source).toBe("derived");
        expect(
          logged.messages.map((m) => ({ role: m.role, content: m.content })),
        ).toEqual([
          { role: "user", content: "make it sharper" },
          { role: "assistant", content: "Sharper prose" },
        ]);
      });

      it("names the session after the command when there is no typed prompt", async () => {
        const { assistant_sessions } = await stream_and_accept({
          command_id: "improve",
        });

        expect(only_session(assistant_sessions).title).toBe("Improve writing");
      });

      it("persists the session with both messages already attached", async () => {
        const { rag_service, assistant_sessions } = await stream_and_accept();

        const logged = only_session(assistant_sessions);
        expect(rag_service.save_session).toHaveBeenCalledTimes(1);
        expect(rag_service.save_session).toHaveBeenCalledWith(
          "vault-1",
          logged,
        );
        expect(logged.messages).toHaveLength(2);
      });

      it("returns from accept without waiting on persistence", async () => {
        const harness = setup_inline();
        harness.stores.vault.set_vault(create_test_vault());
        harness.rag_service.save_session = vi.fn(() => new Promise(() => {}));
        harness.ai_service.stream_inline = vi.fn(function* () {
          yield { type: "text", text: "done" };
        });

        await harness.registry.execute(ACTION_IDS.ai_open_inline_menu);
        await harness.registry.execute(ACTION_IDS.ai_execute_inline, {
          prompt: "go",
        });
        await expect(
          harness.registry.execute(ACTION_IDS.ai_accept_inline),
        ).resolves.toBeUndefined();

        expect(harness.assistant_sessions.sessions).toHaveLength(1);
      });

      it("offers Continue in chat, which opens the session it just created", async () => {
        const { assistant_sessions, opened } = await stream_and_accept();

        click_continue_in_chat();

        expect(opened).toEqual([only_session(assistant_sessions).id]);
      });

      // R3: promoting is opening, not converting — the session keeps its kind
      // and its full history.
      it("leaves the promoted session as an inline session with its history", async () => {
        const { assistant_sessions } = await stream_and_accept();

        click_continue_in_chat();

        const logged = only_session(assistant_sessions);
        expect(logged.kind).toBe("inline");
        expect(logged.messages).toHaveLength(2);
      });

      it("logs one session for the final result when a retry precedes accept", async () => {
        const harness = setup_inline();
        harness.stores.vault.set_vault(create_test_vault());
        let attempt = 0;
        harness.ai_service.stream_inline = vi.fn(function* () {
          attempt += 1;
          yield { type: "text", text: attempt === 1 ? "first" : "second" };
        });

        await harness.registry.execute(ACTION_IDS.ai_open_inline_menu);
        await harness.registry.execute(ACTION_IDS.ai_execute_inline, {
          prompt: "try this",
        });
        await harness.registry.execute(ACTION_IDS.ai_execute_inline, {
          retry: true,
        });
        await harness.registry.execute(ACTION_IDS.ai_accept_inline);

        const logged = only_session(harness.assistant_sessions);
        expect(logged.title).toBe("try this");
        const [, reply] = logged.messages;
        expect(reply?.content).toBe("second");
      });

      it("logs nothing when the result is discarded instead of accepted", async () => {
        const harness = setup_inline();
        harness.stores.vault.set_vault(create_test_vault());
        harness.ai_service.stream_inline = vi.fn(function* () {
          yield { type: "text", text: "unwanted" };
        });

        await harness.registry.execute(ACTION_IDS.ai_open_inline_menu);
        await harness.registry.execute(ACTION_IDS.ai_execute_inline, {
          prompt: "go",
        });
        await harness.registry.execute(ACTION_IDS.ai_reject_inline);

        expect(harness.assistant_sessions.sessions).toEqual([]);
        expect(harness.rag_service.save_session).not.toHaveBeenCalled();
      });

      it("logs nothing when accept fires with no streamed result", async () => {
        const harness = setup_inline();
        harness.stores.vault.set_vault(create_test_vault());

        await harness.registry.execute(ACTION_IDS.ai_open_inline_menu);
        await harness.registry.execute(ACTION_IDS.ai_accept_inline);

        expect(harness.assistant_sessions.sessions).toEqual([]);
        expect(harness.rag_service.save_session).not.toHaveBeenCalled();
      });

      it("leaves no half-session when there is no active vault", async () => {
        const harness = setup_inline();
        harness.ai_service.stream_inline = vi.fn(function* () {
          yield { type: "text", text: "orphan" };
        });

        await harness.registry.execute(ACTION_IDS.ai_open_inline_menu);
        await harness.registry.execute(ACTION_IDS.ai_execute_inline, {
          prompt: "go",
        });
        await harness.registry.execute(ACTION_IDS.ai_accept_inline);

        expect(harness.assistant_sessions.sessions).toEqual([]);
        expect(harness.rag_service.save_session).not.toHaveBeenCalled();
      });

      it("still accepts the edit into the document", async () => {
        const { view } = await stream_and_accept();

        expect(view.state.doc.textContent).toContain("Sharper prose");
        expect(get_ai_menu_state(view.state).open).toBe(false);
      });
    });

    describe("I5: accept routes through the proposal store", () => {
      it("builds a proposal from the note's markdown before and after the stream, and accepts it", async () => {
        const harness = setup_inline();
        harness.stores.vault.set_vault(create_test_vault());
        harness.services.editor.get_ai_context = vi
          .fn()
          .mockReturnValueOnce({
            note_path: as_note_path("docs/demo.md"),
            note_title: "demo",
            markdown: as_markdown_text("# Demo\nOld line"),
            selection: null,
          })
          .mockReturnValueOnce({
            note_path: as_note_path("docs/demo.md"),
            note_title: "demo",
            markdown: as_markdown_text("# Demo\nNew line"),
            selection: null,
          });
        harness.ai_service.stream_inline = vi.fn(function* () {
          yield { type: "text", text: "New line" };
        });

        await harness.registry.execute(ACTION_IDS.ai_open_inline_menu);
        await harness.registry.execute(ACTION_IDS.ai_execute_inline, {
          prompt: "go",
        });
        await harness.registry.execute(ACTION_IDS.ai_accept_inline);

        expect(harness.add_proposal).toHaveBeenCalledTimes(1);
        const [proposal] = harness.assistant_proposals.proposals;
        expect(proposal?.note_path).toBe("docs/demo.md");
        expect(
          proposal?.hunks
            .flatMap((hunk) => hunk.lines)
            .some((line) => line.kind === "add" && line.content === "New line"),
        ).toBe(true);
        expect(harness.accept_proposal).toHaveBeenCalledExactlyOnceWith(
          proposal?.id,
        );
      });

      it("does not create or accept a proposal while the stream is still in flight", async () => {
        const harness = setup_inline();
        harness.stores.vault.set_vault(create_test_vault());
        harness.ai_service.stream_inline = vi.fn(function* () {
          yield { type: "text", text: "partial" };
        });

        await harness.registry.execute(ACTION_IDS.ai_open_inline_menu);
        const execute_promise = harness.registry.execute(
          ACTION_IDS.ai_execute_inline,
          { prompt: "go" },
        );

        expect(harness.add_proposal).not.toHaveBeenCalled();
        expect(harness.accept_proposal).not.toHaveBeenCalled();
        await execute_promise;
      });

      it("does not create a proposal when reject discards the streamed result", async () => {
        const harness = setup_inline();
        harness.stores.vault.set_vault(create_test_vault());
        harness.ai_service.stream_inline = vi.fn(function* () {
          yield { type: "text", text: "unwanted" };
        });

        await harness.registry.execute(ACTION_IDS.ai_open_inline_menu);
        await harness.registry.execute(ACTION_IDS.ai_execute_inline, {
          prompt: "go",
        });
        await harness.registry.execute(ACTION_IDS.ai_reject_inline);

        expect(harness.add_proposal).not.toHaveBeenCalled();
        expect(harness.accept_proposal).not.toHaveBeenCalled();
      });
    });

    describe("context assembly", () => {
      const LONG = "abcdefghij".repeat(1000);

      function capture_prompts(ai_service: { stream_inline: unknown }) {
        const seen: { system_prompt: string; user_prompt: string }[] = [];
        ai_service.stream_inline = vi.fn(function* (args: {
          system_prompt: string;
          user_prompt: string;
        }) {
          seen.push({
            system_prompt: args.system_prompt,
            user_prompt: args.user_prompt,
          });
          yield { type: "text", text: "out" };
        });
        return seen;
      }

      async function run_visual(
        text: string,
        select: (doc: EditorState["doc"]) => TextSelection,
        command_id: string,
      ) {
        const { registry, view, ai_service } = setup_inline(text);
        const seen = capture_prompts(ai_service);
        view.dispatch(view.state.tr.setSelection(select(view.state.doc)));
        await registry.execute(ACTION_IDS.ai_open_inline_menu);
        await registry.execute(ACTION_IDS.ai_execute_inline, { command_id });
        return { seen, view };
      }

      async function run_source(
        markdown: string,
        cursor_offset: number,
        command_id: string,
      ) {
        const { registry, stores, services, ai_service } = setup_inline();
        stores.editor.set_editor_mode("source");
        stores.editor.set_source_view_getter(
          () =>
            ({
              state: { selection: { main: { head: cursor_offset } } },
              coordsAtPos: vi.fn(() => ({ left: 50, top: 60, bottom: 80 })),
            }) as unknown as import("@codemirror/view").EditorView,
        );
        stores.editor.set_cursor_offset(cursor_offset);
        services.editor.get_ai_context = vi.fn().mockReturnValue({
          note_path: as_note_path("docs/demo.md"),
          note_title: "demo",
          markdown: as_markdown_text(markdown),
          selection: null,
        });
        const seen = capture_prompts(ai_service);
        await registry.execute(ACTION_IDS.ai_open_inline_menu);
        await registry.execute(ACTION_IDS.ai_execute_inline, { command_id });
        return seen;
      }

      it("reads only backwards from a bare cursor in the visual editor", async () => {
        const { seen } = await run_visual(
          LONG,
          (doc) => TextSelection.create(doc, 6001),
          "continue",
        );

        expect(seen[0]?.user_prompt).toBe(LONG.slice(2000, 6000));
        expect(seen[0]?.user_prompt.length).toBe(4000);
      });

      it("reads only backwards from a bare cursor in source mode", async () => {
        const seen = await run_source(LONG, 6000, "continue");

        expect(seen[0]?.user_prompt).toBe(LONG.slice(2000, 6000));
      });

      it("assembles the same context for the same recipe in either editor", async () => {
        const { seen: visual } = await run_visual(
          LONG,
          (doc) => TextSelection.create(doc, 6001),
          "continue",
        );
        const source = await run_source(LONG, 6000, "continue");

        expect(source[0]).toEqual(visual[0]);
      });

      it("widens the window on both sides of a selection", async () => {
        const { seen } = await run_visual(
          LONG,
          (doc) => TextSelection.create(doc, 5001, 5101),
          "continue",
        );

        expect(seen[0]?.user_prompt).toBe(LONG.slice(1000, 9100));
      });

      it("captures the selection before the stream transaction deletes it", async () => {
        const marker = "UNIQUEMARKER";
        const text = `head ${marker} tail`;
        const { seen, view } = await run_visual(
          text,
          (doc) => TextSelection.create(doc, 6, 6 + marker.length),
          "continue",
        );

        expect(seen[0]?.user_prompt).toContain(marker);
        expect(view.state.doc.textContent).not.toContain(marker);
      });

      it("sends the selection as the prompt for a selection recipe", async () => {
        const text = "head SELECTED tail";
        const { seen } = await run_visual(
          text,
          (doc) => TextSelection.create(doc, 6, 14),
          "improve",
        );

        expect(seen[0]?.user_prompt).toBe("SELECTED");
      });
    });
  });

  describe("generate description", () => {
    type AiStreamingInput = { on_run_started?: (handle: RunHandle) => void };

    function setup_description(outcome: RunOutcome) {
      // The toast mock is module-scoped, so earlier tests' calls are still on it.
      vi.mocked(toast.success).mockClear();
      vi.mocked(toast.error).mockClear();
      vi.mocked(toast.dismiss).mockClear();

      const harness = create_harness();
      harness.stores.vault.set_vault(create_test_vault());
      const handle: RunHandle = {
        id: "run-1",
        stop: vi.fn(),
        outcome: Promise.resolve(outcome),
      };
      harness.ai_service.execute_streaming = vi
        .fn()
        .mockImplementation((input: AiStreamingInput) => {
          input.on_run_started?.(handle);
          return outcome.status === "error"
            ? { success: false, output: "", error: outcome.error.message }
            : { success: true, output: `"${outcome.text}"`, error: null };
        });
      return harness;
    }

    const done = (text: string): RunOutcome => ({
      status: "done",
      text,
      stats: null,
    });

    it("runs the description as stoppable background work", async () => {
      const { registry, services, ai_service } = setup_description(
        done("A note about notes"),
      );

      await registry.execute(
        ACTION_IDS.ai_generate_description,
        "docs/demo.md",
      );

      expect(ai_service.execute_streaming).toHaveBeenCalledWith(
        expect.objectContaining({
          run: { kind: "background", label: "Generate description" },
          on_run_started: expect.any(Function),
        }),
      );
      expect(services.note.write_note_indexed).toHaveBeenCalledWith(
        as_vault_id("vault-1"),
        "docs/demo.md",
        expect.stringContaining("description: A note about notes"),
      );
      expect(toast.success).toHaveBeenCalledWith("Description generated");
    });

    it("keeps the note's other frontmatter keys", async () => {
      const { registry, services } = setup_description(done("A summary"));

      await registry.execute(
        ACTION_IDS.ai_generate_description,
        "docs/demo.md",
      );

      const written = services.note.write_note_indexed.mock.calls[0]?.[2];
      expect(written).toContain("tags:");
      expect(written).toContain("- notes");
      expect(written).toContain("Body text");
    });

    it("surfaces the kernel's error without writing a broken description", async () => {
      const { registry, services } = setup_description({
        status: "error",
        error: {
          message: "Claude Code is not installed - install it, then try again.",
          detail: "command not found",
        },
        text: "",
      });

      await registry.execute(
        ACTION_IDS.ai_generate_description,
        "docs/demo.md",
      );

      expect(services.note.write_note_indexed).not.toHaveBeenCalled();
      expect(toast.error).toHaveBeenCalledWith(
        "Claude Code is not installed - install it, then try again.",
      );
    });

    // A stopped run reports success with whatever text arrived first. Writing
    // that would leave half a sentence in the note's frontmatter.
    it("writes nothing when the run is stopped mid-flight", async () => {
      const { registry, services } = setup_description({
        status: "aborted",
        text: "A half-writt",
      });

      await registry.execute(
        ACTION_IDS.ai_generate_description,
        "docs/demo.md",
      );

      expect(services.note.write_note_indexed).not.toHaveBeenCalled();
      expect(toast.error).not.toHaveBeenCalled();
      expect(toast.success).not.toHaveBeenCalled();
      // Stopping is not a failure, but the spinner still has to go.
      expect(toast.dismiss).toHaveBeenCalled();
    });

    it("does not start a run when no provider is configured", async () => {
      const { registry, stores, services, ai_service } = setup_description(
        done("A summary"),
      );
      stores.ui.editor_settings.ai_providers = [];

      await registry.execute(
        ACTION_IDS.ai_generate_description,
        "docs/demo.md",
      );

      expect(ai_service.execute_streaming).not.toHaveBeenCalled();
      expect(services.note.write_note_indexed).not.toHaveBeenCalled();
      expect(toast.error).toHaveBeenCalledWith("No AI provider configured");
    });
  });
});
