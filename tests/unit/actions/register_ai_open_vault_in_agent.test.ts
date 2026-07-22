import { beforeEach, describe, expect, it, vi } from "vitest";
import { ActionRegistry } from "$lib/app/action_registry/action_registry";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import { register_ai_actions } from "$lib/features/ai/application/ai_actions";
import { AiStore } from "$lib/features/ai/state/ai_store.svelte";
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

function create_harness() {
  const registry = new ActionRegistry();
  const stores = {
    ui: new UIStore(),
    op: new OpStore(),
    vault: {
      active_vault_id: "v1",
      vault: { id: "v1", name: "demo", path: "/vault/demo" },
    },
    editor: { open_note: null },
  };
  stores.ui.editor_settings.ai_enabled = true;
  stores.ui.editor_settings.ai_providers = BUILTIN_PROVIDER_PRESETS;
  stores.ui.editor_settings.ai_default_provider_id = "claude";
  const ai_service = {
    open_vault_in_agent: vi.fn().mockResolvedValue(undefined),
  };
  const ai_history = {
    load_history: vi.fn().mockResolvedValue([]),
    save_history: vi.fn().mockResolvedValue(undefined),
  };
  register_ai_actions({
    registry,
    stores: stores as never,
    services: {} as never,
    default_mount_config: {
      reset_app_state: true,
      bootstrap_default_vault_path: null,
    },
    ai_store: new AiStore(),
    ai_service: ai_service as never,
    ai_history: ai_history as never,
  });
  return { registry, stores, ai_service };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ai.open_vault_in_agent", () => {
  it("opens the vault in an agent terminal for a claude provider", async () => {
    const { registry, ai_service } = create_harness();
    await registry.execute(ACTION_IDS.ai_open_vault_in_agent);
    expect(ai_service.open_vault_in_agent).toHaveBeenCalledWith(
      expect.objectContaining({ id: "claude" }),
      "/vault/demo",
    );
  });

  it("refuses when AI is disabled in settings", async () => {
    const { registry, stores, ai_service } = create_harness();
    stores.ui.editor_settings.ai_enabled = false;
    await registry.execute(ACTION_IDS.ai_open_vault_in_agent);
    expect(ai_service.open_vault_in_agent).not.toHaveBeenCalled();
    expect(toast.info).toHaveBeenCalledWith(
      "AI Assistant is disabled in settings",
    );
  });

  it("refuses providers without agent support", async () => {
    const { registry, stores, ai_service } = create_harness();
    stores.ui.editor_settings.ai_default_provider_id = "codex";
    await registry.execute(ACTION_IDS.ai_open_vault_in_agent);
    expect(ai_service.open_vault_in_agent).not.toHaveBeenCalled();
    expect(toast.info).toHaveBeenCalledWith(
      "Codex does not support agent mode",
    );
  });

  it("does nothing without an open vault", async () => {
    const { registry, stores, ai_service } = create_harness();
    (stores.vault as { vault: unknown }).vault = null;
    await registry.execute(ACTION_IDS.ai_open_vault_in_agent);
    expect(ai_service.open_vault_in_agent).not.toHaveBeenCalled();
  });

  it("surfaces backend errors as a toast", async () => {
    const { registry, ai_service } = create_harness();
    ai_service.open_vault_in_agent.mockRejectedValueOnce(
      new Error("Carbide MCP server unavailable: boom"),
    );
    await registry.execute(ACTION_IDS.ai_open_vault_in_agent);
    expect(toast.error).toHaveBeenCalledWith(
      "Carbide MCP server unavailable: boom",
    );
  });

  it("strips the tauri invoke prefix from the CLI-missing error", async () => {
    const { registry, ai_service } = create_harness();
    ai_service.open_vault_in_agent.mockRejectedValueOnce(
      new Error(
        "tauri invoke failed: open_vault_in_agent: Claude Code CLI not found — install it or set an absolute command path in AI settings",
      ),
    );
    await registry.execute(ACTION_IDS.ai_open_vault_in_agent);
    expect(toast.error).toHaveBeenCalledWith(
      "Claude Code CLI not found — install it or set an absolute command path in AI settings",
    );
  });
});
