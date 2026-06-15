import { describe, expect, it, vi } from "vitest";
import { ActionRegistry } from "$lib/app/action_registry/action_registry";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import { register_rag_actions } from "$lib/features/rag";
import { RagStore } from "$lib/features/rag";
import { UIStore } from "$lib/app/orchestration/ui_store.svelte";
import { OpStore } from "$lib/app/orchestration/op_store.svelte";
import { BUILTIN_PROVIDER_PRESETS } from "$lib/shared/types/ai_provider_config";
import type { RagStreamEvent } from "$lib/features/rag/domain/rag_types";
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
  };
  stores.ui.editor_settings.ai_providers = BUILTIN_PROVIDER_PRESETS;
  stores.ui.editor_settings.ai_default_provider_id = PROVIDER_ID;

  const rag_service = {
    query: stream_query(events),
    save_session: vi.fn().mockResolvedValue(undefined),
    delete_session: vi.fn().mockResolvedValue(undefined),
  };

  const note_open = vi.fn();
  registry.register({
    id: ACTION_IDS.note_open,
    label: "Open Note",
    execute: note_open,
  });

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
  });

  return { registry, stores, rag_store, rag_service, note_open };
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
});
