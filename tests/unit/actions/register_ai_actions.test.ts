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
import { resolve_instructions } from "$lib/shared/domain/prompt_recipes";
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
import {
  create_open_note_state,
  create_test_note,
  create_test_vault,
} from "../helpers/test_fixtures";
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
// Delegates to the real implementation — the spy exists only to count calls,
// so behaviour is unchanged for every other case in this file.
vi.mock("$lib/shared/domain/prompt_recipes", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("$lib/shared/domain/prompt_recipes")>();
  return {
    ...actual,
    resolve_instructions: vi.fn(actual.resolve_instructions),
  };
});

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
    ai_service: ai_service as never,
    agentic_runner: agentic_runner as never,
    assistant_sessions,
    assistant_proposals,
    assistant_sessions_service: rag_service as never,
  });

  return {
    registry,
    stores,
    services,
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
  // Dialog/panel-surface cases (open/update/execute/apply/stop, document
  // tab, panel streaming) retired with the AI panel — see the retirement
  // commit for the disposition of each case and its successor coverage
  // (open_panel seeding, run-kernel/stop tests, assistant edit actions).

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

      // Source mode has no accept affordance (C1), so whatever lands here is
      // the note. The sanitizer runs on the accumulated stream — a preamble
      // that spans chunks is invisible to any per-chunk filter.
      it("strips model scaffolding from the completed source-mode stream", async () => {
        const { registry, stores, services, ai_service } =
          setup_source_inline();
        stores.editor.set_cursor_offset(6);
        services.editor.get_ai_context = vi.fn().mockReturnValue({
          note_path: as_note_path("docs/demo.md"),
          note_title: "demo",
          markdown: as_markdown_text("Hello source note"),
          selection: null,
        });
        ai_service.stream_inline = vi.fn(function* () {
          yield { type: "text", text: "Here is your res" };
          yield { type: "text", text: "ponse:\n\n```markdown\nAI text\n```" };
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
          yield { type: "text", text: "Sure!\n\nbetter" };
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

    describe("a run logs a ⌁ session", () => {
      function only_session(store: AssistantSessionStore) {
        const [session, ...rest] = store.sessions;
        if (!session || rest.length > 0) {
          throw new Error(
            `expected exactly one logged session, got ${String(store.sessions.length)}`,
          );
        }
        return session;
      }

      function messages_of(store: AssistantSessionStore) {
        return only_session(store).messages.map((m) => ({
          role: m.role,
          content: m.content,
        }));
      }

      function click_view_transcript() {
        const [call] = vi.mocked(toast.success).mock.calls;
        if (!call) throw new Error("no success toast was raised");
        const [message, options] = call;
        expect(message).toBe("Inline edit applied");
        const { action } = options as unknown as {
          action: { label: string; onClick: () => void };
        };
        // The action opens a read-only transcript tab, which is what it now
        // says. "Continue in chat" described a surface it never opened.
        expect(action.label).toBe("View transcript");
        action.onClick();
      }

      async function stream_without_accepting(
        payload: { command_id?: string; prompt?: string } = { prompt: "go" },
        chunks = ["Sharper ", "prose"],
      ) {
        const harness = setup_inline();
        harness.stores.vault.set_vault(create_test_vault());
        harness.ai_service.stream_inline = vi.fn(function* () {
          for (const text of chunks) yield { type: "text", text };
        });

        await harness.registry.execute(ACTION_IDS.ai_open_inline_menu);
        await harness.registry.execute(ACTION_IDS.ai_execute_inline, payload);

        return harness;
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

      it("offers View transcript, which opens the session it just created", async () => {
        const { assistant_sessions, opened } = await stream_and_accept();

        click_view_transcript();

        expect(opened).toEqual([only_session(assistant_sessions).id]);
      });

      // R3: promoting is opening, not converting — the session keeps its kind
      // and its full history.
      it("leaves the promoted session as an inline session with its history", async () => {
        const { assistant_sessions } = await stream_and_accept();

        click_view_transcript();

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

      // The instruction set feeds the log label and the prompt, which are both
      // non-retry work: retry reuses the request and the prompts already
      // recorded. Resolving it anyway would scan the builtins and allocate per
      // entry for a value nothing reads.
      it("resolves the instruction set once per inline run, and not at all on retry", async () => {
        const harness = setup_inline();
        harness.stores.vault.set_vault(create_test_vault());
        harness.ai_service.stream_inline = vi.fn(function* () {
          yield { type: "text", text: "out" };
        });

        await harness.registry.execute(ACTION_IDS.ai_open_inline_menu);
        vi.mocked(resolve_instructions).mockClear();

        await harness.registry.execute(ACTION_IDS.ai_execute_inline, {
          prompt: "go",
        });
        expect(resolve_instructions).toHaveBeenCalledTimes(1);

        vi.mocked(resolve_instructions).mockClear();
        await harness.registry.execute(ACTION_IDS.ai_execute_inline, {
          retry: true,
        });
        expect(resolve_instructions).not.toHaveBeenCalled();
      });

      // The session opens with the run, so "what did that suggest again?" is
      // answerable after a discard. The reply is kept and marked stopped: a
      // discarded draft is still the answer the run produced.
      it("keeps the discarded result as a stopped reply instead of logging nothing", async () => {
        const harness = await stream_without_accepting({ prompt: "go" }, [
          "unwanted",
        ]);

        await harness.registry.execute(ACTION_IDS.ai_reject_inline);

        expect(messages_of(harness.assistant_sessions)).toEqual([
          { role: "user", content: "go" },
          { role: "assistant", content: "unwanted" },
        ]);
        expect(
          only_session(harness.assistant_sessions).messages[1]?.stopped,
        ).toBe(true);
        expect(harness.rag_service.save_session).toHaveBeenCalledTimes(1);
      });

      it("keeps the partial output and the reason when the stream fails", async () => {
        const harness = setup_inline();
        harness.stores.vault.set_vault(create_test_vault());
        harness.ai_service.stream_inline = vi.fn(function* () {
          yield { type: "text", text: "half a th" };
          yield { type: "error", error: "boom" };
        });

        await harness.registry.execute(ACTION_IDS.ai_open_inline_menu);
        await harness.registry.execute(ACTION_IDS.ai_execute_inline, {
          prompt: "go",
        });

        const [, reply] = only_session(harness.assistant_sessions).messages;
        expect(reply?.content).toBe("half a th");
        expect(reply?.error).toBe("boom");
        expect(harness.rag_service.save_session).toHaveBeenCalledTimes(1);
      });

      // I2: closing the menu detaches the surface without cancelling the run,
      // so the transcript is the only place the detached output survives.
      it("settles the session as stopped when the menu closes mid-stream", async () => {
        const harness = setup_inline();
        harness.stores.vault.set_vault(create_test_vault());
        let release!: () => void;
        const gate = new Promise<void>((resolve) => (release = resolve));
        harness.ai_service.stream_inline = vi.fn(async function* () {
          yield { type: "text", text: "partial" };
          await gate;
          yield { type: "text", text: " more" };
        });

        await harness.registry.execute(ACTION_IDS.ai_open_inline_menu);
        const exec = harness.registry.execute(ACTION_IDS.ai_execute_inline, {
          prompt: "go",
        });
        await new Promise((resolve) => setTimeout(resolve, 0));
        await harness.registry.execute(ACTION_IDS.ai_close_inline_menu);
        release();
        await exec;

        expect(messages_of(harness.assistant_sessions)).toEqual([
          { role: "user", content: "go" },
          { role: "assistant", content: "partial" },
        ]);
        expect(
          only_session(harness.assistant_sessions).messages[1]?.stopped,
        ).toBe(true);
      });

      it("holds the request with an empty reply while the run is still live", async () => {
        const harness = await stream_without_accepting();

        expect(messages_of(harness.assistant_sessions)).toEqual([
          { role: "user", content: "go" },
          { role: "assistant", content: "" },
        ]);
      });

      it("fills the reply into the session the run opened, not a second one", async () => {
        const harness = await stream_without_accepting();
        const opened_id = only_session(harness.assistant_sessions).id;

        await harness.registry.execute(ACTION_IDS.ai_accept_inline);

        const logged = only_session(harness.assistant_sessions);
        expect(logged.id).toBe(opened_id);
        expect(logged.messages[1]?.content).toBe("Sharper prose");
      });

      // Accept settles the session; the detached stream arriving afterwards
      // must not rewrite the accepted reply as a stopped one.
      it("does not let a detached stream overwrite an accepted reply", async () => {
        const harness = setup_inline();
        harness.stores.vault.set_vault(create_test_vault());
        let release!: () => void;
        const gate = new Promise<void>((resolve) => (release = resolve));
        harness.ai_service.stream_inline = vi.fn(async function* () {
          yield { type: "text", text: "accepted text" };
          await gate;
          yield { type: "text", text: " and more" };
        });

        await harness.registry.execute(ACTION_IDS.ai_open_inline_menu);
        const exec = harness.registry.execute(ACTION_IDS.ai_execute_inline, {
          prompt: "go",
        });
        await new Promise((resolve) => setTimeout(resolve, 0));
        await harness.registry.execute(ACTION_IDS.ai_accept_inline);
        release();
        await exec;

        const [, reply] = only_session(harness.assistant_sessions).messages;
        expect(reply?.content).toBe("accepted text");
        expect(reply?.stopped).toBeUndefined();
      });

      it("logs a session for a source-mode run, which never reaches accept", async () => {
        const harness = setup_inline();
        harness.stores.vault.set_vault(create_test_vault());
        harness.stores.editor.set_editor_mode("source");
        harness.stores.editor.set_source_view_getter(
          () =>
            ({
              state: { selection: { main: { head: 6 } } },
              coordsAtPos: vi.fn(() => ({ left: 50, top: 60, bottom: 80 })),
            }) as unknown as import("@codemirror/view").EditorView,
        );
        harness.stores.editor.set_cursor_offset(6);
        harness.ai_service.stream_inline = vi.fn(function* () {
          yield { type: "text", text: "Sure!\n\nsource prose" };
        });

        await harness.registry.execute(ACTION_IDS.ai_open_inline_menu);
        await harness.registry.execute(ACTION_IDS.ai_execute_inline, {
          prompt: "go",
        });

        expect(messages_of(harness.assistant_sessions)).toEqual([
          { role: "user", content: "go" },
          { role: "assistant", content: "source prose" },
        ]);
        expect(harness.rag_service.save_session).toHaveBeenCalledTimes(1);
      });

      it("carries the session and the note on the run it started", async () => {
        const harness = setup_inline();
        harness.stores.vault.set_vault(create_test_vault());
        harness.stores.editor.set_open_note(
          create_open_note_state(create_test_note("docs/demo", "Demo")),
        );
        harness.ai_service.stream_inline = vi.fn(function* () {
          yield { type: "text", text: "out" };
        });

        await harness.registry.execute(ACTION_IDS.ai_open_inline_menu);
        await harness.registry.execute(ACTION_IDS.ai_execute_inline, {
          prompt: "go",
        });

        expect(harness.ai_service.stream_inline).toHaveBeenCalledWith(
          expect.objectContaining({
            origin: {
              note_path: "docs/demo.md",
              session_id: only_session(harness.assistant_sessions).id,
            },
          }),
        );
      });

      // Opening the menu is not starting a run. A session belongs to a run, so
      // accepting an empty menu still has nothing to record.
      it("logs nothing when accept fires with no run behind it", async () => {
        const harness = setup_inline();
        harness.stores.vault.set_vault(create_test_vault());

        await harness.registry.execute(ACTION_IDS.ai_open_inline_menu);
        await harness.registry.execute(ACTION_IDS.ai_accept_inline);

        expect(harness.assistant_sessions.sessions).toEqual([]);
        expect(harness.rag_service.save_session).not.toHaveBeenCalled();
      });

      // Sessions are vault-scoped and only a vault has somewhere to persist
      // one. A row that cannot survive a reload is the half-session this
      // guards against, so no vault still means no session.
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
      it("builds a proposal from the note on disk and the buffer after the stream, and accepts it", async () => {
        const harness = setup_inline();
        harness.stores.vault.set_vault(create_test_vault());
        harness.services.note.read_note = vi.fn().mockResolvedValue({
          meta: { title: "demo" },
          markdown: as_markdown_text("# Demo\nOld line"),
        });
        harness.services.editor.get_ai_context = vi.fn().mockReturnValue({
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
        expect(proposal?.target).toEqual({
          kind: "note",
          note_path: "docs/demo.md",
        });
        expect(
          proposal?.hunks
            .flatMap((hunk) => hunk.lines)
            .some((line) => line.kind === "add" && line.content === "New line"),
        ).toBe(true);
        expect(harness.accept_proposal).toHaveBeenCalledExactlyOnceWith(
          proposal?.id,
        );
        // The proposal's provenance is the logged inline session, not a
        // throwaway UUID — the review centre groups by it.
        const inline_session = harness.assistant_sessions.sessions.find(
          (session) => session.kind === "inline",
        );
        expect(inline_session).toBeDefined();
        expect(proposal?.origin.session_id).toBe(inline_session?.id);
      });

      // 1.3-B. base_revision is what ProposalApplyService checks against the
      // note on disk, so it has to describe those bytes. Taking it from the
      // buffer made every accept stale whenever the buffer ran ahead of disk —
      // silently before the batch, as a "Proposal is out of date" toast after.
      it("bases the proposal on disk, not on a buffer that ran ahead of it", async () => {
        const harness = setup_inline();
        harness.stores.vault.set_vault(create_test_vault());
        const on_disk = "# Demo\nSaved line";
        harness.services.note.read_note = vi.fn().mockResolvedValue({
          meta: { title: "demo" },
          markdown: as_markdown_text(on_disk),
        });
        harness.services.editor.get_ai_context = vi.fn().mockReturnValue({
          note_path: as_note_path("docs/demo.md"),
          note_title: "demo",
          markdown: as_markdown_text("# Demo\nSaved line\nUnsaved edit\nNew"),
          selection: null,
        });
        harness.ai_service.stream_inline = vi.fn(function* () {
          yield { type: "text", text: "New" };
        });

        await harness.registry.execute(ACTION_IDS.ai_open_inline_menu);
        await harness.registry.execute(ACTION_IDS.ai_execute_inline, {
          prompt: "go",
        });
        await harness.registry.execute(ACTION_IDS.ai_accept_inline);

        // The unsaved line is on screen but not on disk, so a disk-based
        // proposal has to carry it. A buffer-based one diffs the buffer
        // against itself and produces nothing at all.
        const [proposal] = harness.assistant_proposals.proposals;
        expect(
          proposal?.hunks
            .flatMap((hunk) => hunk.lines)
            .filter((line) => line.kind === "add")
            .map((line) => line.content),
        ).toContain("Unsaved edit");
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

    describe("model scaffolding never reaches the document", () => {
      it("rewrites the streamed preview to the sanitized text when the stream completes", async () => {
        const harness = setup_inline();
        harness.ai_service.stream_inline = vi.fn(function* () {
          yield { type: "text", text: "Here is your res" };
          yield { type: "text", text: "ponse:\n\nSharper prose" };
        });

        await harness.registry.execute(ACTION_IDS.ai_open_inline_menu);
        await harness.registry.execute(ACTION_IDS.ai_execute_inline, {
          prompt: "go",
        });

        const ps = get_ai_menu_state(harness.view.state);
        expect(
          harness.view.state.doc.textBetween(
            ps.ai_range_from,
            ps.ai_range_to,
            "\n",
            "\n",
          ),
        ).toBe("Sharper prose");
        expect(harness.view.state.doc.textContent).not.toContain(
          "Here is your response",
        );
        expect(ps.streaming).toBe(false);
        expect(ps.mode).toBe("cursor_suggestion");
      });

      it("leaves an already-clean stream untouched", async () => {
        const harness = setup_inline();
        harness.ai_service.stream_inline = vi.fn(function* () {
          yield { type: "text", text: "Sharper " };
          yield { type: "text", text: "prose" };
        });

        await harness.registry.execute(ACTION_IDS.ai_open_inline_menu);
        await harness.registry.execute(ACTION_IDS.ai_execute_inline, {
          prompt: "go",
        });

        const ps = get_ai_menu_state(harness.view.state);
        expect(
          harness.view.state.doc.textBetween(
            ps.ai_range_from,
            ps.ai_range_to,
            "\n",
            "\n",
          ),
        ).toBe("Sharper prose");
      });

      it("logs the sanitized text as the accepted result", async () => {
        const harness = setup_inline();
        harness.stores.vault.set_vault(create_test_vault());
        harness.ai_service.stream_inline = vi.fn(function* () {
          yield {
            type: "text",
            text: "Sure!\n\n```markdown\nSharper prose\n```",
          };
        });

        await harness.registry.execute(ACTION_IDS.ai_open_inline_menu);
        await harness.registry.execute(ACTION_IDS.ai_execute_inline, {
          prompt: "go",
        });
        await harness.registry.execute(ACTION_IDS.ai_accept_inline);

        const [logged] = harness.assistant_sessions.sessions;
        const [, reply] = logged?.messages ?? [];
        expect(reply?.content).toBe("Sharper prose");
      });
    });

    // Y1: the before-snapshot accept diffs against belongs to one note. Shared
    // across every run it produced "delete all of B, insert all of A", caught
    // only by the proposal's base-revision staleness check.
    describe("an inline run belongs to the note it started in", () => {
      async function stream_in_note(path: string) {
        const harness = setup_inline();
        harness.stores.vault.set_vault(create_test_vault());
        harness.stores.editor.set_open_note(
          create_open_note_state(create_test_note(path, "Demo")),
        );
        harness.ai_service.stream_inline = vi.fn(function* () {
          yield { type: "text", text: "Sharper prose" };
        });
        vi.mocked(toast.error).mockClear();

        await harness.registry.execute(ACTION_IDS.ai_open_inline_menu);
        await harness.registry.execute(ACTION_IDS.ai_execute_inline, {
          prompt: "go",
        });
        return harness;
      }

      it("accepts into the note the run started in", async () => {
        const harness = await stream_in_note("docs/demo");

        await harness.registry.execute(ACTION_IDS.ai_accept_inline);

        expect(harness.add_proposal).toHaveBeenCalledTimes(1);
        expect(harness.assistant_sessions.sessions).toHaveLength(1);
        expect(toast.error).not.toHaveBeenCalled();
      });

      it("refuses to accept into a note the run did not start in", async () => {
        const harness = await stream_in_note("docs/demo");
        harness.services.editor.get_ai_context = vi.fn().mockReturnValue({
          note_path: as_note_path("docs/other.md"),
          note_title: "other",
          markdown: as_markdown_text("# Other"),
          selection: null,
        });

        await harness.registry.execute(ACTION_IDS.ai_accept_inline);

        expect(harness.add_proposal).not.toHaveBeenCalled();
        expect(harness.accept_proposal).not.toHaveBeenCalled();
        // The run's own session stays open and unanswered — refusing to accept
        // is not refusing to have run. Nothing new is logged and nothing is
        // settled, so re-accepting from the right note still records the reply.
        const [session, ...rest] = harness.assistant_sessions.sessions;
        expect(rest).toEqual([]);
        expect(session?.origin).toEqual({ note_path: "docs/demo.md" });
        expect(session?.messages[1]?.content).toBe("");
        expect(harness.rag_service.save_session).not.toHaveBeenCalled();
        expect(toast.error).toHaveBeenCalledWith(
          "This inline edit was started in docs/demo.md — open that note to accept it.",
        );
      });

      it("keeps the result reviewable instead of dropping it on refusal", async () => {
        const harness = await stream_in_note("docs/demo");
        harness.services.editor.get_ai_context = vi.fn().mockReturnValue({
          note_path: as_note_path("docs/other.md"),
          note_title: "other",
          markdown: as_markdown_text("# Other"),
          selection: null,
        });

        await harness.registry.execute(ACTION_IDS.ai_accept_inline);

        const ps = get_ai_menu_state(harness.view.state);
        expect(ps.open).toBe(true);
        expect(
          harness.view.state.doc.textBetween(
            ps.ai_range_from,
            ps.ai_range_to,
            "\n",
            "\n",
          ),
        ).toBe("Sharper prose");
      });

      it("does not let a later run's snapshot be accepted by an earlier one", async () => {
        const harness = await stream_in_note("docs/demo");
        harness.stores.editor.set_open_note(
          create_open_note_state(create_test_note("docs/other", "Other")),
        );
        harness.services.editor.get_ai_context = vi.fn().mockReturnValue({
          note_path: as_note_path("docs/other.md"),
          note_title: "other",
          markdown: as_markdown_text("# Other"),
          selection: null,
        });
        await harness.registry.execute(ACTION_IDS.ai_execute_inline, {
          prompt: "second run",
        });
        await harness.registry.execute(ACTION_IDS.ai_accept_inline);

        const [proposal] = harness.assistant_proposals.proposals;
        expect(proposal?.target).toEqual({
          kind: "note",
          note_path: "docs/other.md",
        });
        expect(harness.assistant_sessions.sessions[0]?.origin).toEqual({
          note_path: "docs/other.md",
        });
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
