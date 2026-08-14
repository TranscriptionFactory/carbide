import { beforeEach, describe, expect, it, vi } from "vitest";
import { ActionRegistry } from "$lib/app/action_registry/action_registry";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import { register_chat_actions } from "$lib/features/assistant";
import {
  AssistantChatStore,
  AssistantProposalStore,
  AssistantSessionStore,
} from "$lib/features/assistant";
import { UIStore } from "$lib/app/orchestration/ui_store.svelte";
import { OpStore } from "$lib/app/orchestration/op_store.svelte";
import { BUILTIN_PROVIDER_PRESETS } from "$lib/shared/types/ai_provider_config";
import { DEFAULT_EDITOR_SETTINGS } from "$lib/shared/types/editor_settings";
import type {
  AssistantChatSourceInfo,
  AssistantChatStreamEvent,
} from "$lib/features/assistant";
import { collect_open_note_image_parts } from "$lib/features/ai";
import { toast } from "svelte-sonner";
import { create_test_run_starter } from "../../adapters/test_run_starter";

const PROVIDER_ID = BUILTIN_PROVIDER_PRESETS[0]?.id ?? "claude";

vi.mock("svelte-sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    loading: vi.fn(),
  },
}));

vi.mock("$lib/features/ai", async (importOriginal) => {
  const original = await importOriginal<typeof import("$lib/features/ai")>();
  return {
    ...original,
    collect_open_note_image_parts: vi
      .fn()
      .mockResolvedValue([
        { type: "image", media_type: "image/png", data: "abc" },
      ]),
  };
});

const ANSWERED_EVENTS: AssistantChatStreamEvent[] = [
  { type: "text", text: "42 [1]." },
  {
    type: "citation",
    citation: { index: 1, note_path: "notes/q.md", title: "Q" },
  },
  { type: "done" },
];

function stream_query(events: AssistantChatStreamEvent[]) {
  // eslint-disable-next-line @typescript-eslint/require-await
  return vi.fn(async function* () {
    for (const event of events) yield event;
  });
}

function create_harness(events: AssistantChatStreamEvent[] = ANSWERED_EVENTS) {
  const registry = new ActionRegistry();
  const assistant_sessions = new AssistantSessionStore();
  const chat_store = new AssistantChatStore(assistant_sessions);
  const stores = {
    ui: new UIStore(),
    op: new OpStore(),
    vault: { active_vault_id: "v1" },
    editor: {
      open_note: null as { meta: { path: string; title: string } } | null,
    },
  };
  stores.ui.editor_settings.ai_providers = BUILTIN_PROVIDER_PRESETS;
  stores.ui.editor_settings.ai_default_provider_id = PROVIDER_ID;

  const chat_service = {
    query: stream_query(events),
  };

  const session_service = {
    save_session: vi.fn().mockResolvedValue(undefined),
    delete_session: vi.fn().mockResolvedValue(undefined),
    generate_title: vi.fn().mockResolvedValue(null),
  };

  const note_open = vi.fn();
  registry.register({
    id: ACTION_IDS.note_open,
    label: "Open Note",
    execute: note_open,
  });

  const run_starter = create_test_run_starter(() => [
    { type: "done", stats: {} },
  ]);
  const assistant_kernel = {
    start: run_starter.start,
    resolve_provider: vi.fn((requested_id?: string) =>
      Promise.resolve(
        stores.ui.editor_settings.ai_providers.find(
          (p) => p.id === requested_id,
        ) ?? null,
      ),
    ),
  };

  const services = {
    clipboard: { copy_text: vi.fn().mockResolvedValue(undefined) },
  };

  const documents = {
    read_document: vi.fn(() => null),
    stage_document: vi.fn(() => false),
  };

  register_chat_actions({
    registry,
    stores: stores as never,
    services: services as never,
    default_mount_config: {
      reset_app_state: true,
      bootstrap_default_vault_path: null,
    },
    chat_store,
    documents,
    chat_service: chat_service as never,
    session_service: session_service as never,
    assistant_kernel: assistant_kernel as never,
    permissions: {
      respond: async () => {},
      set_auto_approve: () => Promise.resolve(true),
      grants: async () => [],
      revoke: async () => {},
    },
    assistant_proposals: new AssistantProposalStore(),
  });

  return {
    registry,
    stores,
    chat_store,
    assistant_sessions,
    chat_service,
    session_service,
    note_open,
    services,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("register_chat_actions", () => {
  it("asks: runs the query and records user + assistant messages", async () => {
    const { registry, chat_store, chat_service, stores } = create_harness();

    await registry.execute(ACTION_IDS.rag_ask, "what is it?");

    expect(chat_service.query).toHaveBeenCalledWith(
      expect.objectContaining({ question: "what is it?" }),
    );
    expect(chat_store.messages.map((m) => m.role)).toEqual([
      "user",
      "assistant",
    ]);
    expect(chat_store.messages[1]?.citations).toHaveLength(1);
    expect(chat_store.is_loading).toBe(false);
    expect(stores.op.get("rag.ask").status).toBe("success");
  });

  it("asks: applies pending sources at event receipt and clears them on finish", async () => {
    const { registry, chat_store, chat_service } = create_harness();
    const source: AssistantChatSourceInfo = {
      note_path: "notes/q.md",
      title: "Q",
      score: 0.9,
      truncated: false,
      pinned: false,
    };
    let pending_before_text: AssistantChatSourceInfo[] | null = null;
    // eslint-disable-next-line @typescript-eslint/require-await
    chat_service.query = vi.fn(
      async function* (): AsyncGenerator<AssistantChatStreamEvent> {
        yield { type: "generating" };
        yield {
          type: "sources",
          stats: { retrieved: 1, used: 1, truncated: 0 },
          sources: [source],
        };
        pending_before_text = chat_store.pending_sources;
        yield { type: "text", text: "42." };
        yield { type: "done" };
      },
    );

    await registry.execute(ACTION_IDS.rag_ask, "what is it?");

    expect(pending_before_text).toEqual([source]);
    expect(chat_store.pending_sources).toBeNull();
  });

  it("asks: passes RAG retrieval settings from editor settings", async () => {
    const { registry, chat_service, stores } = create_harness();
    stores.ui.editor_settings.ai_rag_retrieve_limit = 30;
    stores.ui.editor_settings.ai_rag_context_token_budget = 12000;

    await registry.execute(ACTION_IDS.rag_ask, "what is it?");

    expect(chat_service.query).toHaveBeenCalledWith(
      expect.objectContaining({
        retrieve_limit: 30,
        assembler_options: { token_budget: 12000 },
      }),
    );
  });

  it("asks: clamps out-of-range retrieval settings to sane bounds", async () => {
    const { registry, chat_service, stores } = create_harness();
    stores.ui.editor_settings.ai_rag_retrieve_limit = 999;
    stores.ui.editor_settings.ai_rag_context_token_budget = 1;

    await registry.execute(ACTION_IDS.rag_ask, "what is it?");

    expect(chat_service.query).toHaveBeenCalledWith(
      expect.objectContaining({
        retrieve_limit: 50,
        assembler_options: { token_budget: 1000 },
      }),
    );
  });

  it("asks: falls back to defaults when retrieval settings are invalid", async () => {
    const { registry, chat_service, stores } = create_harness();
    stores.ui.editor_settings.ai_rag_retrieve_limit = Number.NaN;
    stores.ui.editor_settings.ai_rag_context_token_budget = Number.NaN;

    await registry.execute(ACTION_IDS.rag_ask, "what is it?");

    expect(chat_service.query).toHaveBeenCalledWith(
      expect.objectContaining({
        retrieve_limit: DEFAULT_EDITOR_SETTINGS.ai_rag_retrieve_limit,
        assembler_options: {
          token_budget: DEFAULT_EDITOR_SETTINGS.ai_rag_context_token_budget,
        },
      }),
    );
  });

  it("asks: persists the active session after a completed turn", async () => {
    const { registry, session_service } = create_harness();

    await registry.execute(ACTION_IDS.rag_ask, "what is it?");

    expect(session_service.save_session).toHaveBeenCalledTimes(1);
    const [vault_id, session] =
      session_service.save_session.mock.calls[0] ?? [];
    expect(vault_id).toBe("v1");
    expect(session.messages.map((m: { role: string }) => m.role)).toEqual([
      "user",
      "assistant",
    ]);
  });

  it("delete session: removes from the store and deletes the persisted file", async () => {
    const { registry, chat_store, session_service } = create_harness();
    await registry.execute(ACTION_IDS.rag_ask, "what is it?");
    const id = chat_store.active_id;

    await registry.execute(ACTION_IDS.rag_delete_session, id);

    expect(chat_store.sessions).toEqual([]);
    expect(session_service.delete_session).toHaveBeenCalledWith("v1", id);
  });

  it("switching sessions mid-stream does not let the old turn write into it", async () => {
    const { registry, chat_store, chat_service } = create_harness();
    await registry.execute(ACTION_IDS.rag_ask, "first question");
    const first_id = chat_store.active_id;

    chat_service.query = vi.fn(
      async function* (): AsyncGenerator<AssistantChatStreamEvent> {
        yield { type: "text", text: "answer for second" };
        // user switches back to the first session mid-stream
        await registry.execute(ACTION_IDS.rag_switch_session, first_id);
        yield { type: "text", text: " continued" };
        yield { type: "done" };
      },
    );

    chat_store.start_new_session();
    await registry.execute(ACTION_IDS.rag_ask, "second question");

    const first = chat_store.sessions.find((s) => s.id === first_id);
    expect(first?.messages.some((m) => m.content.includes("continued"))).toBe(
      false,
    );
  });

  it("asks: surfaces a failed query as store error", async () => {
    const { registry, chat_store, stores } = create_harness([
      { type: "error", error: "index down" },
    ]);

    await registry.execute(ACTION_IDS.rag_ask, "q");

    expect(chat_store.error).toBe("index down");
    expect(stores.op.get("rag.ask").status).toBe("error");
  });

  it("asks: persists the session even when the turn fails", async () => {
    const { registry, session_service } = create_harness([
      { type: "error", error: "index down" },
    ]);

    await registry.execute(ACTION_IDS.rag_ask, "doomed question");

    expect(session_service.save_session).toHaveBeenCalledTimes(1);
    const [vault_id, session] = (session_service.save_session.mock.calls[0] ??
      []) as [string, { messages: { content: string }[] }];
    expect(vault_id).toBe("v1");
    expect(session.messages.map((m) => m.content)).toEqual(["doomed question"]);
  });

  it("asks: keeps the partial reply when the stream errors mid-answer", async () => {
    const { registry, chat_store } = create_harness([
      { type: "text", text: "partial answer" },
      { type: "error", error: "rate limited" },
    ]);

    await registry.execute(ACTION_IDS.rag_ask, "q");

    expect(chat_store.messages.map((m) => m.content)).toEqual([
      "q",
      "partial answer",
    ]);
    expect(chat_store.error).toBe("rate limited");
  });

  it("asks: skips open-note images for an unrelated vault-wide question", async () => {
    const { registry, chat_service, stores } = create_harness();
    stores.editor.open_note = {
      meta: { path: "notes/pic.md", title: "Pic" },
    };

    await registry.execute(ACTION_IDS.rag_ask, "what did I write last week?");

    expect(collect_open_note_image_parts).not.toHaveBeenCalled();
    expect(chat_service.query).toHaveBeenCalledWith(
      expect.objectContaining({ image_parts: [] }),
    );
  });

  it("asks: attaches open-note images when the note is @mentioned", async () => {
    const { registry, chat_service, stores } = create_harness();
    stores.editor.open_note = {
      meta: { path: "notes/pic.md", title: "Pic" },
    };

    await registry.execute(ACTION_IDS.rag_ask, "explain the diagram in @Pic");

    expect(collect_open_note_image_parts).toHaveBeenCalledTimes(1);
    expect(chat_service.query).toHaveBeenCalledWith(
      expect.objectContaining({
        image_parts: [{ type: "image", media_type: "image/png", data: "abc" }],
      }),
    );
  });

  it("asks: attaches open-note images when the note sits inside the folder scope", async () => {
    const { registry, chat_service, chat_store, stores } = create_harness();
    stores.editor.open_note = {
      meta: { path: "projects/pic.md", title: "Pic" },
    };
    chat_store.set_scope({ folders: ["projects"] });

    await registry.execute(ACTION_IDS.rag_ask, "what is in this folder?");

    expect(collect_open_note_image_parts).toHaveBeenCalledTimes(1);
    expect(chat_service.query).toHaveBeenCalledWith(
      expect.objectContaining({
        image_parts: [{ type: "image", media_type: "image/png", data: "abc" }],
      }),
    );
  });

  it("asks: attaches open-note images when the chat is scoped to that note", async () => {
    const { registry, chat_service, chat_store, stores } = create_harness();
    stores.editor.open_note = {
      meta: { path: "projects/pic.md", title: "Pic" },
    };
    chat_store.set_scope({ notes: ["projects/pic.md"] });

    await registry.execute(ACTION_IDS.rag_ask, "what is in this note?");

    expect(collect_open_note_image_parts).toHaveBeenCalledTimes(1);
    expect(chat_service.query).toHaveBeenCalledWith(
      expect.objectContaining({
        image_parts: [{ type: "image", media_type: "image/png", data: "abc" }],
      }),
    );
  });

  it("asks: passes the note scope through to the query", async () => {
    const { registry, chat_service, chat_store } = create_harness();
    chat_store.set_scope({ notes: ["projects/a.md"] });

    await registry.execute(ACTION_IDS.rag_ask, "q");

    expect(chat_service.query).toHaveBeenCalledWith(
      expect.objectContaining({ scope: { notes: ["projects/a.md"] } }),
    );
  });

  // The scope is captured when the turn starts. Switching notes mid-run must
  // not retarget a question the user already asked — the answer would silently
  // come from somewhere other than what the composer showed at ask time.
  it("a note switch mid-stream does not retarget the in-flight turn", async () => {
    const { registry, chat_service, chat_store, stores } = create_harness();
    stores.editor.open_note = { meta: { path: "a.md", title: "A" } };
    chat_store.set_scope({ notes: ["a.md"] });

    chat_service.query = vi.fn(
      async function* (): AsyncGenerator<AssistantChatStreamEvent> {
        yield { type: "text", text: "partial" };
        stores.editor.open_note = { meta: { path: "b.md", title: "B" } };
        chat_store.set_scope({ notes: ["b.md"] });
        yield { type: "done" };
      },
    );

    await registry.execute(ACTION_IDS.rag_ask, "q");

    expect(chat_service.query).toHaveBeenCalledWith(
      expect.objectContaining({ scope: { notes: ["a.md"] } }),
    );
    expect(chat_store.scope).toEqual({ notes: ["b.md"] });
  });

  it("new chat clears the conversation and resets the pending op", async () => {
    const { registry, chat_store, stores } = create_harness();
    await registry.execute(ACTION_IDS.rag_ask, "what is it?");
    expect(chat_store.messages.length).toBeGreaterThan(0);

    await registry.execute(ACTION_IDS.rag_new_chat);

    expect(chat_store.messages).toEqual([]);
    expect(stores.op.get("rag.ask").status).toBe("idle");
  });

  it("a turn invalidated mid-stream stops writing to the store", async () => {
    const { registry, chat_store, chat_service, stores } = create_harness();
    chat_service.query = vi.fn(
      async function* (): AsyncGenerator<AssistantChatStreamEvent> {
        yield { type: "text", text: "partial" };
        // the user starts a new chat while this turn is still streaming
        await registry.execute(ACTION_IDS.rag_new_chat);
        yield { type: "text", text: " more" };
        yield { type: "done" };
      },
    );

    await registry.execute(ACTION_IDS.rag_ask, "q");

    expect(chat_store.messages).toEqual([]);
    expect(chat_store.streaming_id).toBeNull();
    expect(stores.op.get("rag.ask").status).toBe("idle");
  });

  it("asks: ignores blank questions", async () => {
    const { registry, chat_service, chat_store } = create_harness();

    await registry.execute(ACTION_IDS.rag_ask, "   ");

    expect(chat_service.query).not.toHaveBeenCalled();
    expect(chat_store.messages).toEqual([]);
  });

  it("asks: does nothing when AI is disabled", async () => {
    const { registry, chat_service, stores } = create_harness();
    stores.ui.editor_settings.ai_enabled = false;

    await registry.execute(ACTION_IDS.rag_ask, "q");

    expect(chat_service.query).not.toHaveBeenCalled();
    expect(toast.info).toHaveBeenCalledWith(
      "AI Assistant is disabled in settings",
    );
  });

  it("open: selects the rag sidebar view and seeds the provider", async () => {
    const { registry, stores, chat_store } = create_harness();

    await registry.execute(ACTION_IDS.rag_open);

    expect(stores.ui.sidebar_view).toBe("rag");
    expect(stores.ui.sidebar_open).toBe(true);
    expect(chat_store.provider_id).toBe(PROVIDER_ID);
  });

  it("open_citation: delegates to note.open with the note path", async () => {
    const { registry, note_open } = create_harness();

    await registry.execute(ACTION_IDS.rag_open_citation, "notes/q.md");

    expect(note_open).toHaveBeenCalledWith("notes/q.md");
  });

  it("copy message: routes the message content through the clipboard service", async () => {
    const { registry, chat_store, services } = create_harness();

    await registry.execute(ACTION_IDS.rag_ask, "what is it?");
    const assistant = chat_store.messages[1];
    await registry.execute(ACTION_IDS.rag_copy_message, assistant?.id);

    expect(services.clipboard.copy_text).toHaveBeenCalledWith("42 [1].");
  });

  it("copy message: reports a clipboard failure instead of rejecting", async () => {
    const { registry, chat_store, services } = create_harness();
    services.clipboard.copy_text.mockRejectedValueOnce(new Error("denied"));

    await registry.execute(ACTION_IDS.rag_ask, "what is it?");
    const assistant = chat_store.messages[1];

    await expect(
      registry.execute(ACTION_IDS.rag_copy_message, assistant?.id),
    ).resolves.not.toThrow();
    expect(toast.error).toHaveBeenCalledWith("Failed to copy message");
  });

  it("regenerate: cuts the reply and re-asks the same question without duplicating it", async () => {
    const { registry, chat_store, chat_service } = create_harness();
    await registry.execute(ACTION_IDS.rag_ask, "what is it?");
    const assistant_id = chat_store.messages[1]?.id;

    await registry.execute(ACTION_IDS.rag_regenerate, assistant_id);

    expect(chat_service.query).toHaveBeenCalledTimes(2);
    expect(chat_service.query).toHaveBeenLastCalledWith(
      expect.objectContaining({ question: "what is it?", history: [] }),
    );
    expect(chat_store.messages.map((m) => m.role)).toEqual([
      "user",
      "assistant",
    ]);
    expect(chat_store.messages[0]?.content).toBe("what is it?");
  });

  it("regenerate: keeps the reply when AI is disabled", async () => {
    const { registry, chat_store, chat_service, stores } = create_harness();
    await registry.execute(ACTION_IDS.rag_ask, "what is it?");
    const assistant_id = chat_store.messages[1]?.id;
    stores.ui.editor_settings.ai_enabled = false;

    await registry.execute(ACTION_IDS.rag_regenerate, assistant_id);

    expect(chat_service.query).toHaveBeenCalledTimes(1);
    expect(chat_store.messages.map((m) => m.role)).toEqual([
      "user",
      "assistant",
    ]);
  });

  it("regenerate: does nothing for an unknown message id", async () => {
    const { registry, chat_service } = create_harness();
    await registry.execute(ACTION_IDS.rag_ask, "what is it?");

    await registry.execute(ACTION_IDS.rag_regenerate, "missing");

    expect(chat_service.query).toHaveBeenCalledTimes(1);
  });

  it("fork: clones the session, activates it, and persists the fork", async () => {
    const { registry, chat_store, session_service } = create_harness();
    await registry.execute(ACTION_IDS.rag_ask, "what is it?");
    const original_id = chat_store.active_id;
    const assistant_id = chat_store.messages[1]?.id;
    session_service.save_session.mockClear();

    await registry.execute(ACTION_IDS.rag_fork, assistant_id);

    expect(chat_store.active_id).not.toBe(original_id);
    expect(chat_store.sessions).toHaveLength(2);
    expect(session_service.save_session).toHaveBeenCalledTimes(1);
    const [, session] = (session_service.save_session.mock.calls[0] ?? []) as [
      string,
      { id: string; title: string },
    ];
    expect(session.id).toBe(chat_store.active_id);
    expect(session.title).toMatch(/\(fork\)$/);
  });

  it("autotitle: renames the session after the first exchange and only once", async () => {
    const { registry, chat_store, session_service } = create_harness();
    session_service.generate_title.mockResolvedValue("Model title");

    await registry.execute(ACTION_IDS.rag_ask, "what is it about caching?");
    await flush();

    const session = chat_store.sessions[0];
    expect(session?.title).toBe("Model title");
    expect(session?.title_source).toBe("generated");
    expect(session_service.save_session).toHaveBeenCalledTimes(2);

    await registry.execute(ACTION_IDS.rag_ask, "and what else?");
    await flush();

    expect(session_service.generate_title).toHaveBeenCalledTimes(1);
  });

  it("autotitle: skips sessions the user renamed", async () => {
    const { registry, chat_store, assistant_sessions, session_service } =
      create_harness();
    session_service.generate_title.mockResolvedValue("Model title");
    assistant_sessions.hydrate([
      {
        id: "a",
        kind: "chat",
        title: "My name",
        title_source: "manual",
        origin: {},
        created_at: 1,
        updated_at: 2,
        messages: [],
        provider_id: PROVIDER_ID,
        scope: {},
        mode: "ask",
        auto_approve: false,
        changed_files: [],
      },
    ]);
    chat_store.switch_session("a");

    await registry.execute(ACTION_IDS.rag_ask, "what is it?");
    await flush();

    expect(session_service.generate_title).not.toHaveBeenCalled();
    expect(chat_store.sessions[0]?.title).toBe("My name");
  });

  it("autotitle: keeps the derived title when generation fails", async () => {
    const { registry, chat_store, session_service } = create_harness();
    session_service.generate_title.mockResolvedValue(null);

    await registry.execute(ACTION_IDS.rag_ask, "what is it?");
    await flush();

    expect(chat_store.sessions[0]?.title).toBe("what is it?");
    expect(chat_store.sessions[0]?.title_source).toBe("derived");
    expect(session_service.save_session).toHaveBeenCalledTimes(1);
  });

  // A stopped naming run is what generate_title now reports as null, and the
  // point of that is that nothing downstream writes.
  it("autotitle: writes nothing to the session when the naming run is stopped", async () => {
    const { registry, chat_store, session_service } = create_harness();
    session_service.generate_title.mockResolvedValue(null);
    const rename = vi.spyOn(chat_store, "rename_session");

    await registry.execute(ACTION_IDS.rag_ask, "what is it?");
    await flush();

    expect(session_service.generate_title).toHaveBeenCalledTimes(1);
    expect(rename).not.toHaveBeenCalled();
  });

  it("autotitle: drops a stale title when the revision moved on", async () => {
    const { registry, chat_store, session_service } = create_harness();
    let resolve_title!: (value: string | null) => void;
    session_service.generate_title.mockImplementation(
      () => new Promise<string | null>((resolve) => (resolve_title = resolve)),
    );

    await registry.execute(ACTION_IDS.rag_ask, "what is it?");
    const session_id = chat_store.active_id;
    await registry.execute(ACTION_IDS.rag_new_chat);
    resolve_title("Stale title");
    await flush();

    const session = chat_store.sessions.find((s) => s.id === session_id);
    expect(session?.title).toBe("what is it?");
    expect(session_service.save_session).toHaveBeenCalledTimes(1);
  });

  it("autotitle: keeps a manual rename made while generation is in flight", async () => {
    const { registry, chat_store, session_service } = create_harness();
    let resolve_title!: (value: string | null) => void;
    session_service.generate_title.mockImplementation(
      () => new Promise<string | null>((resolve) => (resolve_title = resolve)),
    );

    await registry.execute(ACTION_IDS.rag_ask, "what is it?");
    const session_id = chat_store.active_id!;
    chat_store.rename_session(session_id, "Manual title");
    resolve_title("Generated title");
    await flush();

    const session = chat_store.sessions.find((s) => s.id === session_id);
    expect(session?.title).toBe("Manual title");
    expect(session?.title_source).toBe("manual");
    expect(session_service.save_session).toHaveBeenCalledTimes(1);
  });
});

// 1e: a submission made while a turn is in flight used to hit a silent
// `return` in the runner after the composer had already cleared itself.
describe("register_chat_actions — queued prompts", () => {
  function gate_query(
    chat_service: { query: unknown },
    tail: AssistantChatStreamEvent[],
  ) {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    chat_service.query = vi.fn(
      async function* (): AsyncGenerator<AssistantChatStreamEvent> {
        yield { type: "text", text: "partial" };
        await gate;
        for (const event of tail) yield event;
      },
    );
    return { release };
  }

  function user_messages(chat_store: {
    messages: { role: string; content: string }[];
  }) {
    return chat_store.messages
      .filter((m) => m.role === "user")
      .map((m) => m.content);
  }

  it("holds a submission made mid-turn and sends it once the turn completes", async () => {
    const { registry, chat_store, chat_service } = create_harness();
    const gate = gate_query(chat_service, [{ type: "done" }]);

    const first = registry.execute(ACTION_IDS.rag_ask, "first question");
    await flush();
    void registry.execute(ACTION_IDS.rag_ask, "second question");
    await flush();

    expect(chat_store.queued_prompt?.text).toBe("second question");
    expect(chat_service.query).toHaveBeenCalledTimes(1);

    gate.release();
    await first;
    await flush();

    expect(chat_service.query).toHaveBeenCalledTimes(2);
    expect(user_messages(chat_store)).toEqual([
      "first question",
      "second question",
    ]);
    expect(chat_store.queued_prompt).toBeNull();
    expect(chat_store.composer_restore).toBeNull();
  });

  it("stopping the run returns the queued prompt to the composer unsent", async () => {
    const { registry, chat_store, chat_service } = create_harness();
    const gate = gate_query(chat_service, []);

    const first = registry.execute(ACTION_IDS.rag_ask, "first question");
    await flush();
    void registry.execute(ACTION_IDS.rag_ask, "second question");
    await flush();
    await registry.execute(ACTION_IDS.rag_stop);

    gate.release();
    await first;
    await flush();

    expect(chat_service.query).toHaveBeenCalledTimes(1);
    expect(user_messages(chat_store)).toEqual(["first question"]);
    expect(chat_store.queued_prompt).toBeNull();
    expect(chat_store.composer_restore).toBe("second question");
  });

  it("an errored turn returns the queued prompt rather than sending it", async () => {
    const { registry, chat_store, chat_service } = create_harness();
    const gate = gate_query(chat_service, [{ type: "error", error: "boom" }]);

    const first = registry.execute(ACTION_IDS.rag_ask, "first question");
    await flush();
    void registry.execute(ACTION_IDS.rag_ask, "second question");
    await flush();

    gate.release();
    await first;
    await flush();

    expect(chat_service.query).toHaveBeenCalledTimes(1);
    expect(user_messages(chat_store)).toEqual(["first question"]);
    expect(chat_store.error).toBe("boom");
    expect(chat_store.composer_restore).toBe("second question");
  });

  it("a session switch drops the queued prompt instead of firing it into the new session", async () => {
    const { registry, chat_store, chat_service, assistant_sessions } =
      create_harness();
    const gate = gate_query(chat_service, [{ type: "done" }]);

    const first = registry.execute(ACTION_IDS.rag_ask, "first question");
    await flush();
    void registry.execute(ACTION_IDS.rag_ask, "second question");
    await flush();

    const other = assistant_sessions.create({
      kind: "chat",
      title: "Elsewhere",
      provider_id: PROVIDER_ID,
    });
    await registry.execute(ACTION_IDS.rag_switch_session, other.id);

    gate.release();
    await first;
    await flush();

    expect(chat_service.query).toHaveBeenCalledTimes(1);
    expect(chat_store.active_id).toBe(other.id);
    expect(chat_store.messages).toEqual([]);
    expect(chat_store.queued_prompt).toBeNull();
    expect(chat_store.composer_restore).toBeNull();
  });

  it("stopping an agent run returns the queued prompt to the composer", async () => {
    const { registry, chat_store } = create_harness();
    chat_store.queue_prompt("second question");

    await registry.execute(ACTION_IDS.rag_agent_abort);

    expect(chat_store.queued_prompt).toBeNull();
    expect(chat_store.composer_restore).toBe("second question");
  });
});

// Same loss class as 1e: these runners bail after the composer has already
// cleared itself, so the text needs the restore channel too.
describe("register_chat_actions — submissions the runner refuses", () => {
  it("hands the question back when AI is disabled", async () => {
    const { registry, chat_store, chat_service, stores } = create_harness();
    stores.ui.editor_settings.ai_enabled = false;

    await registry.execute(ACTION_IDS.rag_ask, "what is it?");

    expect(chat_service.query).not.toHaveBeenCalled();
    expect(chat_store.messages).toEqual([]);
    expect(chat_store.composer_restore).toBe("what is it?");
  });

  it("hands the question back when no provider resolves", async () => {
    const { registry, chat_store, chat_service, stores } = create_harness();
    stores.ui.editor_settings.ai_providers = [];

    await registry.execute(ACTION_IDS.rag_ask, "what is it?");

    expect(chat_service.query).not.toHaveBeenCalled();
    expect(chat_store.composer_restore).toBe("what is it?");
  });

  it("hands the prompt back when the provider has no agent mode", async () => {
    const { registry, chat_store, stores } = create_harness();
    // A CLI transport with no ACP spec has no agent backend to run on.
    stores.ui.editor_settings.ai_providers = [
      {
        id: PROVIDER_ID,
        name: "Text only",
        transport: { kind: "cli", command: "text-only", args: [] },
      },
    ];
    chat_store.set_mode("agent");

    await registry.execute(ACTION_IDS.rag_ask, "run the thing");

    expect(chat_store.messages).toEqual([]);
    expect(chat_store.composer_restore).toBe("run the thing");
  });

  it("keeps a regenerated question out of the composer", async () => {
    const { registry, chat_store, stores } = create_harness();

    await registry.execute(ACTION_IDS.rag_ask, "what is it?");
    const reply_id = chat_store.messages[1]!.id;
    stores.ui.editor_settings.ai_providers = [];

    await registry.execute(ACTION_IDS.rag_regenerate, reply_id);

    expect(chat_store.composer_restore).toBeNull();
  });
});
