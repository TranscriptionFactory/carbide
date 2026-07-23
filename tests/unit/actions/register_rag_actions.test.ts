import { beforeEach, describe, expect, it, vi } from "vitest";
import { ActionRegistry } from "$lib/app/action_registry/action_registry";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import { register_rag_actions } from "$lib/features/rag";
import { RagStore } from "$lib/features/rag";
import { UIStore } from "$lib/app/orchestration/ui_store.svelte";
import { OpStore } from "$lib/app/orchestration/op_store.svelte";
import { BUILTIN_PROVIDER_PRESETS } from "$lib/shared/types/ai_provider_config";
import { DEFAULT_EDITOR_SETTINGS } from "$lib/shared/types/editor_settings";
import type {
  RagSourceInfo,
  RagStreamEvent,
} from "$lib/features/rag/domain/rag_types";
import { collect_open_note_image_parts } from "$lib/features/ai";
import { toast } from "svelte-sonner";

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

const ANSWERED_EVENTS: RagStreamEvent[] = [
  { type: "text", text: "42 [1]." },
  {
    type: "citation",
    citation: { index: 1, note_path: "notes/q.md", title: "Q" },
  },
  { type: "done" },
];

function stream_query(events: RagStreamEvent[]) {
  // eslint-disable-next-line @typescript-eslint/require-await
  return vi.fn(async function* () {
    for (const event of events) yield event;
  });
}

function create_harness(events: RagStreamEvent[] = ANSWERED_EVENTS) {
  const registry = new ActionRegistry();
  const rag_store = new RagStore();
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

  const rag_service = {
    query: stream_query(events),
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

  const agent_port = {
    stream_turn: vi.fn(() =>
      // eslint-disable-next-line @typescript-eslint/require-await
      (async function* () {
        yield { type: "done" as const, stats: {} };
      })(),
    ),
  };

  register_rag_actions({
    registry,
    stores: stores as never,
    services: {} as never,
    default_mount_config: {
      reset_app_state: true,
      bootstrap_default_vault_path: null,
    },
    rag_store,
    rag_service: rag_service as never,
    agent_port,
  });

  return { registry, stores, rag_store, rag_service, note_open };
}

beforeEach(() => {
  vi.clearAllMocks();
});

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("register_rag_actions", () => {
  it("asks: runs the query and records user + assistant messages", async () => {
    const { registry, rag_store, rag_service, stores } = create_harness();

    await registry.execute(ACTION_IDS.rag_ask, "what is it?");

    expect(rag_service.query).toHaveBeenCalledWith(
      expect.objectContaining({ question: "what is it?" }),
    );
    expect(rag_store.messages.map((m) => m.role)).toEqual([
      "user",
      "assistant",
    ]);
    expect(rag_store.messages[1]?.citations).toHaveLength(1);
    expect(rag_store.is_loading).toBe(false);
    expect(stores.op.get("rag.ask").status).toBe("success");
  });

  it("asks: applies pending sources at event receipt and clears them on finish", async () => {
    const { registry, rag_store, rag_service } = create_harness();
    const source: RagSourceInfo = {
      note_path: "notes/q.md",
      title: "Q",
      score: 0.9,
      truncated: false,
      pinned: false,
    };
    let pending_before_text: RagSourceInfo[] | null = null;
    // eslint-disable-next-line @typescript-eslint/require-await
    rag_service.query = vi.fn(
      async function* (): AsyncGenerator<RagStreamEvent> {
        yield { type: "generating" };
        yield {
          type: "sources",
          stats: { retrieved: 1, used: 1, truncated: 0 },
          sources: [source],
        };
        pending_before_text = rag_store.pending_sources;
        yield { type: "text", text: "42." };
        yield { type: "done" };
      },
    );

    await registry.execute(ACTION_IDS.rag_ask, "what is it?");

    expect(pending_before_text).toEqual([source]);
    expect(rag_store.pending_sources).toBeNull();
  });

  it("asks: passes RAG retrieval settings from editor settings", async () => {
    const { registry, rag_service, stores } = create_harness();
    stores.ui.editor_settings.ai_rag_retrieve_limit = 30;
    stores.ui.editor_settings.ai_rag_context_token_budget = 12000;

    await registry.execute(ACTION_IDS.rag_ask, "what is it?");

    expect(rag_service.query).toHaveBeenCalledWith(
      expect.objectContaining({
        retrieve_limit: 30,
        assembler_options: { token_budget: 12000 },
      }),
    );
  });

  it("asks: clamps out-of-range retrieval settings to sane bounds", async () => {
    const { registry, rag_service, stores } = create_harness();
    stores.ui.editor_settings.ai_rag_retrieve_limit = 999;
    stores.ui.editor_settings.ai_rag_context_token_budget = 1;

    await registry.execute(ACTION_IDS.rag_ask, "what is it?");

    expect(rag_service.query).toHaveBeenCalledWith(
      expect.objectContaining({
        retrieve_limit: 50,
        assembler_options: { token_budget: 1000 },
      }),
    );
  });

  it("asks: falls back to defaults when retrieval settings are invalid", async () => {
    const { registry, rag_service, stores } = create_harness();
    stores.ui.editor_settings.ai_rag_retrieve_limit = Number.NaN;
    stores.ui.editor_settings.ai_rag_context_token_budget = Number.NaN;

    await registry.execute(ACTION_IDS.rag_ask, "what is it?");

    expect(rag_service.query).toHaveBeenCalledWith(
      expect.objectContaining({
        retrieve_limit: DEFAULT_EDITOR_SETTINGS.ai_rag_retrieve_limit,
        assembler_options: {
          token_budget: DEFAULT_EDITOR_SETTINGS.ai_rag_context_token_budget,
        },
      }),
    );
  });

  it("asks: persists the active session after a completed turn", async () => {
    const { registry, rag_service } = create_harness();

    await registry.execute(ACTION_IDS.rag_ask, "what is it?");

    expect(rag_service.save_session).toHaveBeenCalledTimes(1);
    const [vault_id, session] = rag_service.save_session.mock.calls[0] ?? [];
    expect(vault_id).toBe("v1");
    expect(session.messages.map((m: { role: string }) => m.role)).toEqual([
      "user",
      "assistant",
    ]);
  });

  it("delete session: removes from the store and deletes the persisted file", async () => {
    const { registry, rag_store, rag_service } = create_harness();
    await registry.execute(ACTION_IDS.rag_ask, "what is it?");
    const id = rag_store.active_id;

    await registry.execute(ACTION_IDS.rag_delete_session, id);

    expect(rag_store.sessions).toEqual([]);
    expect(rag_service.delete_session).toHaveBeenCalledWith("v1", id);
  });

  it("switching sessions mid-stream does not let the old turn write into it", async () => {
    const { registry, rag_store, rag_service } = create_harness();
    await registry.execute(ACTION_IDS.rag_ask, "first question");
    const first_id = rag_store.active_id;

    rag_service.query = vi.fn(
      async function* (): AsyncGenerator<RagStreamEvent> {
        yield { type: "text", text: "answer for second" };
        // user switches back to the first session mid-stream
        await registry.execute(ACTION_IDS.rag_switch_session, first_id);
        yield { type: "text", text: " continued" };
        yield { type: "done" };
      },
    );

    rag_store.start_new_session();
    await registry.execute(ACTION_IDS.rag_ask, "second question");

    const first = rag_store.sessions.find((s) => s.id === first_id);
    expect(first?.messages.some((m) => m.content.includes("continued"))).toBe(
      false,
    );
  });

  it("asks: surfaces a failed query as store error", async () => {
    const { registry, rag_store, stores } = create_harness([
      { type: "error", error: "index down" },
    ]);

    await registry.execute(ACTION_IDS.rag_ask, "q");

    expect(rag_store.error).toBe("index down");
    expect(stores.op.get("rag.ask").status).toBe("error");
  });

  it("asks: persists the session even when the turn fails", async () => {
    const { registry, rag_service } = create_harness([
      { type: "error", error: "index down" },
    ]);

    await registry.execute(ACTION_IDS.rag_ask, "doomed question");

    expect(rag_service.save_session).toHaveBeenCalledTimes(1);
    const [vault_id, session] = (rag_service.save_session.mock.calls[0] ??
      []) as [string, { messages: { content: string }[] }];
    expect(vault_id).toBe("v1");
    expect(session.messages.map((m) => m.content)).toEqual(["doomed question"]);
  });

  it("asks: keeps the partial reply when the stream errors mid-answer", async () => {
    const { registry, rag_store } = create_harness([
      { type: "text", text: "partial answer" },
      { type: "error", error: "rate limited" },
    ]);

    await registry.execute(ACTION_IDS.rag_ask, "q");

    expect(rag_store.messages.map((m) => m.content)).toEqual([
      "q",
      "partial answer",
    ]);
    expect(rag_store.error).toBe("rate limited");
  });

  it("asks: skips open-note images for an unrelated vault-wide question", async () => {
    const { registry, rag_service, stores } = create_harness();
    stores.editor.open_note = {
      meta: { path: "notes/pic.md", title: "Pic" },
    };

    await registry.execute(ACTION_IDS.rag_ask, "what did I write last week?");

    expect(collect_open_note_image_parts).not.toHaveBeenCalled();
    expect(rag_service.query).toHaveBeenCalledWith(
      expect.objectContaining({ image_parts: [] }),
    );
  });

  it("asks: attaches open-note images when the note is @mentioned", async () => {
    const { registry, rag_service, stores } = create_harness();
    stores.editor.open_note = {
      meta: { path: "notes/pic.md", title: "Pic" },
    };

    await registry.execute(ACTION_IDS.rag_ask, "explain the diagram in @Pic");

    expect(collect_open_note_image_parts).toHaveBeenCalledTimes(1);
    expect(rag_service.query).toHaveBeenCalledWith(
      expect.objectContaining({
        image_parts: [{ type: "image", media_type: "image/png", data: "abc" }],
      }),
    );
  });

  it("asks: attaches open-note images when the note sits inside the folder scope", async () => {
    const { registry, rag_service, rag_store, stores } = create_harness();
    stores.editor.open_note = {
      meta: { path: "projects/pic.md", title: "Pic" },
    };
    rag_store.set_scope({ folders: ["projects"] });

    await registry.execute(ACTION_IDS.rag_ask, "what is in this folder?");

    expect(collect_open_note_image_parts).toHaveBeenCalledTimes(1);
    expect(rag_service.query).toHaveBeenCalledWith(
      expect.objectContaining({
        image_parts: [{ type: "image", media_type: "image/png", data: "abc" }],
      }),
    );
  });

  it("new chat clears the conversation and resets the pending op", async () => {
    const { registry, rag_store, stores } = create_harness();
    await registry.execute(ACTION_IDS.rag_ask, "what is it?");
    expect(rag_store.messages.length).toBeGreaterThan(0);

    await registry.execute(ACTION_IDS.rag_new_chat);

    expect(rag_store.messages).toEqual([]);
    expect(stores.op.get("rag.ask").status).toBe("idle");
  });

  it("a turn invalidated mid-stream stops writing to the store", async () => {
    const { registry, rag_store, rag_service, stores } = create_harness();
    rag_service.query = vi.fn(
      async function* (): AsyncGenerator<RagStreamEvent> {
        yield { type: "text", text: "partial" };
        // the user starts a new chat while this turn is still streaming
        await registry.execute(ACTION_IDS.rag_new_chat);
        yield { type: "text", text: " more" };
        yield { type: "done" };
      },
    );

    await registry.execute(ACTION_IDS.rag_ask, "q");

    expect(rag_store.messages).toEqual([]);
    expect(rag_store.streaming_id).toBeNull();
    expect(stores.op.get("rag.ask").status).toBe("idle");
  });

  it("asks: ignores blank questions", async () => {
    const { registry, rag_service, rag_store } = create_harness();

    await registry.execute(ACTION_IDS.rag_ask, "   ");

    expect(rag_service.query).not.toHaveBeenCalled();
    expect(rag_store.messages).toEqual([]);
  });

  it("asks: does nothing when AI is disabled", async () => {
    const { registry, rag_service, stores } = create_harness();
    stores.ui.editor_settings.ai_enabled = false;

    await registry.execute(ACTION_IDS.rag_ask, "q");

    expect(rag_service.query).not.toHaveBeenCalled();
    expect(toast.info).toHaveBeenCalledWith(
      "AI Assistant is disabled in settings",
    );
  });

  it("open: selects the rag sidebar view and seeds the provider", async () => {
    const { registry, stores, rag_store } = create_harness();

    await registry.execute(ACTION_IDS.rag_open);

    expect(stores.ui.sidebar_view).toBe("rag");
    expect(stores.ui.sidebar_open).toBe(true);
    expect(rag_store.provider_id).toBe(PROVIDER_ID);
  });

  it("open_citation: delegates to note.open with the note path", async () => {
    const { registry, note_open } = create_harness();

    await registry.execute(ACTION_IDS.rag_open_citation, "notes/q.md");

    expect(note_open).toHaveBeenCalledWith("notes/q.md");
  });

  it("copy message: writes the message content to the clipboard", async () => {
    const { registry, rag_store } = create_harness();
    const write_text = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText: write_text } });

    await registry.execute(ACTION_IDS.rag_ask, "what is it?");
    const assistant = rag_store.messages[1];
    await registry.execute(ACTION_IDS.rag_copy_message, assistant?.id);

    expect(write_text).toHaveBeenCalledWith("42 [1].");
    vi.unstubAllGlobals();
  });

  it("regenerate: cuts the reply and re-asks the same question without duplicating it", async () => {
    const { registry, rag_store, rag_service } = create_harness();
    await registry.execute(ACTION_IDS.rag_ask, "what is it?");
    const assistant_id = rag_store.messages[1]?.id;

    await registry.execute(ACTION_IDS.rag_regenerate, assistant_id);

    expect(rag_service.query).toHaveBeenCalledTimes(2);
    expect(rag_service.query).toHaveBeenLastCalledWith(
      expect.objectContaining({ question: "what is it?", history: [] }),
    );
    expect(rag_store.messages.map((m) => m.role)).toEqual([
      "user",
      "assistant",
    ]);
    expect(rag_store.messages[0]?.content).toBe("what is it?");
  });

  it("regenerate: keeps the reply when AI is disabled", async () => {
    const { registry, rag_store, rag_service, stores } = create_harness();
    await registry.execute(ACTION_IDS.rag_ask, "what is it?");
    const assistant_id = rag_store.messages[1]?.id;
    stores.ui.editor_settings.ai_enabled = false;

    await registry.execute(ACTION_IDS.rag_regenerate, assistant_id);

    expect(rag_service.query).toHaveBeenCalledTimes(1);
    expect(rag_store.messages.map((m) => m.role)).toEqual([
      "user",
      "assistant",
    ]);
  });

  it("regenerate: does nothing for an unknown message id", async () => {
    const { registry, rag_service } = create_harness();
    await registry.execute(ACTION_IDS.rag_ask, "what is it?");

    await registry.execute(ACTION_IDS.rag_regenerate, "missing");

    expect(rag_service.query).toHaveBeenCalledTimes(1);
  });

  it("fork: clones the session, activates it, and persists the fork", async () => {
    const { registry, rag_store, rag_service } = create_harness();
    await registry.execute(ACTION_IDS.rag_ask, "what is it?");
    const original_id = rag_store.active_id;
    const assistant_id = rag_store.messages[1]?.id;
    rag_service.save_session.mockClear();

    await registry.execute(ACTION_IDS.rag_fork, assistant_id);

    expect(rag_store.active_id).not.toBe(original_id);
    expect(rag_store.sessions).toHaveLength(2);
    expect(rag_service.save_session).toHaveBeenCalledTimes(1);
    const [, session] = (rag_service.save_session.mock.calls[0] ?? []) as [
      string,
      { id: string; title: string },
    ];
    expect(session.id).toBe(rag_store.active_id);
    expect(session.title).toMatch(/\(fork\)$/);
  });

  it("autotitle: renames the session after the first exchange and only once", async () => {
    const { registry, rag_store, rag_service } = create_harness();
    rag_service.generate_title.mockResolvedValue("Model title");

    await registry.execute(ACTION_IDS.rag_ask, "what is it about caching?");
    await flush();

    const session = rag_store.sessions[0];
    expect(session?.title).toBe("Model title");
    expect(session?.title_source).toBe("generated");
    expect(rag_service.save_session).toHaveBeenCalledTimes(2);

    await registry.execute(ACTION_IDS.rag_ask, "and what else?");
    await flush();

    expect(rag_service.generate_title).toHaveBeenCalledTimes(1);
  });

  it("autotitle: skips sessions the user renamed", async () => {
    const { registry, rag_store, rag_service } = create_harness();
    rag_service.generate_title.mockResolvedValue("Model title");
    rag_store.hydrate([
      {
        id: "a",
        title: "My name",
        title_source: "manual",
        created_at: 1,
        updated_at: 2,
        messages: [],
        provider_id: PROVIDER_ID,
        scope: {},
        mode: "ask",
        permission_mode: "safe",
        changed_files: [],
      },
    ]);
    rag_store.switch_session("a");

    await registry.execute(ACTION_IDS.rag_ask, "what is it?");
    await flush();

    expect(rag_service.generate_title).not.toHaveBeenCalled();
    expect(rag_store.sessions[0]?.title).toBe("My name");
  });

  it("autotitle: keeps the derived title when generation fails", async () => {
    const { registry, rag_store, rag_service } = create_harness();
    rag_service.generate_title.mockResolvedValue(null);

    await registry.execute(ACTION_IDS.rag_ask, "what is it?");
    await flush();

    expect(rag_store.sessions[0]?.title).toBe("what is it?");
    expect(rag_store.sessions[0]?.title_source).toBe("derived");
    expect(rag_service.save_session).toHaveBeenCalledTimes(1);
  });

  it("autotitle: drops a stale title when the revision moved on", async () => {
    const { registry, rag_store, rag_service } = create_harness();
    let resolve_title!: (value: string | null) => void;
    rag_service.generate_title.mockImplementation(
      () => new Promise<string | null>((resolve) => (resolve_title = resolve)),
    );

    await registry.execute(ACTION_IDS.rag_ask, "what is it?");
    const session_id = rag_store.active_id;
    await registry.execute(ACTION_IDS.rag_new_chat);
    resolve_title("Stale title");
    await flush();

    const session = rag_store.sessions.find((s) => s.id === session_id);
    expect(session?.title).toBe("what is it?");
    expect(rag_service.save_session).toHaveBeenCalledTimes(1);
  });

  it("autotitle: keeps a manual rename made while generation is in flight", async () => {
    const { registry, rag_store, rag_service } = create_harness();
    let resolve_title!: (value: string | null) => void;
    rag_service.generate_title.mockImplementation(
      () => new Promise<string | null>((resolve) => (resolve_title = resolve)),
    );

    await registry.execute(ACTION_IDS.rag_ask, "what is it?");
    const session_id = rag_store.active_id!;
    rag_store.rename_session(session_id, "Manual title");
    resolve_title("Generated title");
    await flush();

    const session = rag_store.sessions.find((s) => s.id === session_id);
    expect(session?.title).toBe("Manual title");
    expect(session?.title_source).toBe("manual");
    expect(rag_service.save_session).toHaveBeenCalledTimes(1);
  });
});
