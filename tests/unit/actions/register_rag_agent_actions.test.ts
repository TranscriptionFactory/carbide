import { beforeEach, describe, expect, it, vi } from "vitest";
import { ActionRegistry } from "$lib/app/action_registry/action_registry";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import { register_rag_actions, RagStore } from "$lib/features/rag";
import type { AgentEvent, AgentStreamRequest } from "$lib/features/rag";
import { UIStore } from "$lib/app/orchestration/ui_store.svelte";
import { OpStore } from "$lib/app/orchestration/op_store.svelte";
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

const AGENT_EVENTS: AgentEvent[] = [
  { type: "init", session_id: "sess-1" },
  { type: "text", delta: "All organized." },
  { type: "done", stats: {} },
];

function create_harness(events: AgentEvent[] = AGENT_EVENTS) {
  const registry = new ActionRegistry();
  const rag_store = new RagStore();
  const stores = {
    ui: new UIStore(),
    op: new OpStore(),
    vault: {
      active_vault_id: "v1",
      vault: { id: "v1", name: "demo", path: "/vault/demo" },
    },
    editor: { open_note: null },
  };
  stores.ui.editor_settings.ai_providers = BUILTIN_PROVIDER_PRESETS;
  stores.ui.editor_settings.ai_default_provider_id = "claude";

  const rag_service = {
    save_session: vi.fn().mockResolvedValue(undefined),
    delete_session: vi.fn().mockResolvedValue(undefined),
    generate_title: vi.fn().mockResolvedValue(null),
  };

  const agent_port = {
    stream_turn: vi.fn((_input: AgentStreamRequest) =>
      // eslint-disable-next-line @typescript-eslint/require-await
      (async function* () {
        for (const event of events) yield event;
      })(),
    ),
  };

  const native_agent_port = {
    stream_turn: vi.fn((_input: AgentStreamRequest) =>
      // eslint-disable-next-line @typescript-eslint/require-await
      (async function* () {
        for (const event of events) yield event;
      })(),
    ),
  };

  const git_service = {
    create_checkpoint: vi.fn().mockResolvedValue({ status: "created" }),
  };

  register_rag_actions({
    registry,
    stores: stores as never,
    services: { git: git_service } as never,
    default_mount_config: {
      reset_app_state: true,
      bootstrap_default_vault_path: null,
    },
    rag_store,
    rag_service: rag_service as never,
    agent_port,
    native_agent_port,
  });

  return {
    registry,
    stores,
    rag_store,
    rag_service,
    agent_port,
    native_agent_port,
    git_service,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("rag agent actions", () => {
  it("set_mode: switches the session mode to agent", async () => {
    const { registry, rag_store } = create_harness();

    await registry.execute(ACTION_IDS.rag_set_mode, "agent");

    expect(rag_store.mode).toBe("agent");
  });

  it("set_mode: refuses agent mode when AI is disabled", async () => {
    const { registry, stores, rag_store } = create_harness();
    stores.ui.editor_settings.ai_enabled = false;

    await registry.execute(ACTION_IDS.rag_set_mode, "agent");

    expect(rag_store.mode).toBe("ask");
    expect(toast.info).toHaveBeenCalledWith(
      "AI Assistant is disabled in settings",
    );
  });

  it("ask in agent mode: does nothing when AI is disabled", async () => {
    const { registry, stores, rag_store, agent_port } = create_harness();
    rag_store.set_mode("agent");
    stores.ui.editor_settings.ai_enabled = false;

    await registry.execute(ACTION_IDS.rag_ask, "organize my notes");

    expect(agent_port.stream_turn).not.toHaveBeenCalled();
    expect(toast.info).toHaveBeenCalledWith(
      "AI Assistant is disabled in settings",
    );
  });

  it("ask in agent mode: refuses text-only CLI providers with a toast", async () => {
    const { registry, stores, rag_store, agent_port, native_agent_port } =
      create_harness();
    rag_store.set_mode("agent");
    stores.ui.editor_settings.ai_default_provider_id = "ollama";

    await registry.execute(ACTION_IDS.rag_ask, "organize my notes");

    expect(agent_port.stream_turn).not.toHaveBeenCalled();
    expect(native_agent_port.stream_turn).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(
      "Ollama does not support agent mode",
    );
    expect(rag_store.messages).toEqual([]);
  });

  it("ask in agent mode: runs the agent turn and records the reply", async () => {
    const { registry, rag_store, agent_port, git_service, stores } =
      create_harness();
    rag_store.set_mode("agent");

    await registry.execute(ACTION_IDS.rag_ask, "organize my notes");

    expect(git_service.create_checkpoint).toHaveBeenCalledTimes(1);
    expect(agent_port.stream_turn).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "organize my notes",
        permission_mode: "safe",
        vault_path: "/vault/demo",
      }),
    );
    expect(rag_store.messages.map((m) => m.role)).toEqual([
      "user",
      "assistant",
    ]);
    expect(rag_store.messages[1]?.content).toBe("All organized.");
    expect(rag_store.active?.agent_session_id).toBe("sess-1");
    expect(stores.op.get("rag.ask").status).toBe("success");
  });

  it("ask in agent mode: routes the claude provider to the harness port", async () => {
    const { registry, rag_store, agent_port, native_agent_port } =
      create_harness();
    rag_store.set_mode("agent");

    await registry.execute(ACTION_IDS.rag_ask, "organize my notes");

    expect(agent_port.stream_turn).toHaveBeenCalledTimes(1);
    expect(native_agent_port.stream_turn).not.toHaveBeenCalled();
  });

  it("ask in agent mode: routes api providers to the native agent port", async () => {
    const { registry, stores, rag_store, agent_port, native_agent_port } =
      create_harness();
    rag_store.set_mode("agent");
    stores.ui.editor_settings.ai_default_provider_id = "lmstudio";

    await registry.execute(ACTION_IDS.rag_ask, "organize my notes");

    expect(native_agent_port.stream_turn).toHaveBeenCalledTimes(1);
    expect(agent_port.stream_turn).not.toHaveBeenCalled();
    expect(stores.op.get("rag.ask").status).toBe("success");
  });

  it("native agent run: streams tool events and completes coherently", async () => {
    const events: AgentEvent[] = [
      { type: "init", session_id: "native-sess" },
      {
        type: "tool_start",
        name: "mcp__carbide__create_note",
        input_summary: '{"path":"notes/new.md"}',
      },
      { type: "tool_end", name: "mcp__carbide__create_note", ok: true },
      { type: "text", delta: "Created the note." },
      { type: "done", stats: { num_turns: 2 } },
    ];
    const {
      registry,
      stores,
      rag_store,
      rag_service,
      native_agent_port,
      git_service,
    } = create_harness(events);
    registry.register({
      id: ACTION_IDS.folder_refresh_tree,
      label: "Refresh Tree",
      execute: vi.fn(),
    });
    rag_store.set_mode("agent");
    stores.ui.editor_settings.ai_default_provider_id = "lmstudio";

    await registry.execute(ACTION_IDS.rag_ask, "create a note");

    expect(git_service.create_checkpoint).toHaveBeenCalledTimes(1);
    expect(native_agent_port.stream_turn).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "create a note",
        permission_mode: "safe",
        vault_path: "/vault/demo",
      }),
    );
    expect(rag_store.messages.map((m) => m.role)).toEqual([
      "user",
      "assistant",
    ]);
    expect(rag_store.messages[1]?.content).toBe("Created the note.");
    expect(rag_store.active?.agent_session_id).toBe("native-sess");
    expect(rag_store.active?.changed_files).toEqual(["notes/new.md"]);
    expect(rag_service.save_session).toHaveBeenCalled();
    expect(stores.op.get("rag.ask").status).toBe("success");
  });

  it("set_permission_mode: updates the store and active session", async () => {
    const { registry, rag_store } = create_harness();
    rag_store.set_mode("agent");
    rag_store.add_user_message("hi");

    await registry.execute(ACTION_IDS.rag_set_permission_mode, "power");

    expect(rag_store.permission_mode).toBe("power");
    expect(rag_store.active?.permission_mode).toBe("power");
  });

  it("new_chat: seeds permission_mode from the configured default", async () => {
    const { registry, stores, rag_store } = create_harness();
    stores.ui.editor_settings.ai_agent_permission_default = "power";
    rag_store.set_permission_mode("safe");

    await registry.execute(ACTION_IDS.rag_new_chat);

    expect(rag_store.permission_mode).toBe("power");
  });

  it("agent_abort: is a no-op when nothing is running", async () => {
    const { registry } = create_harness();

    await expect(
      registry.execute(ACTION_IDS.rag_agent_abort),
    ).resolves.not.toThrow();
  });
});
