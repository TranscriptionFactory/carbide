import { describe, expect, it, vi } from "vitest";
import { ActionRegistry } from "$lib/app/action_registry/action_registry";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import { register_rag_actions } from "$lib/features/rag";
import { RagStore } from "$lib/features/rag";
import { UIStore } from "$lib/app/orchestration/ui_store.svelte";
import { OpStore } from "$lib/app/orchestration/op_store.svelte";
import { BUILTIN_PROVIDER_PRESETS } from "$lib/shared/types/ai_provider_config";
import type { RagQueryResult } from "$lib/features/rag/domain/rag_types";
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

function answered(content: string): RagQueryResult {
  return {
    content,
    citations: [{ index: 1, note_path: "notes/q.md", title: "Q" }],
    contexts: [],
    status: "answered",
    error: null,
  };
}

function create_harness(query_result: RagQueryResult = answered("42 [1].")) {
  const registry = new ActionRegistry();
  const rag_store = new RagStore();
  const stores = {
    ui: new UIStore(),
    op: new OpStore(),
  };
  stores.ui.editor_settings.ai_providers = BUILTIN_PROVIDER_PRESETS;
  stores.ui.editor_settings.ai_default_provider_id = PROVIDER_ID;

  const rag_service = { query: vi.fn().mockResolvedValue(query_result) };

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

  it("asks: surfaces a failed query as store error", async () => {
    const { registry, rag_store, stores } = create_harness({
      content: "",
      citations: [],
      contexts: [],
      status: "failed",
      error: "index down",
    });

    await registry.execute(ACTION_IDS.rag_ask, "q");

    expect(rag_store.error).toBe("index down");
    expect(stores.op.get("rag.ask").status).toBe("error");
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
