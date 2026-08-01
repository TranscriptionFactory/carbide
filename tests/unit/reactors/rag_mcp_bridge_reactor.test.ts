import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));
vi.mock("$lib/shared/utils/detect_platform", () => ({ is_tauri: true }));
// The bridge posts its answer back over the wire; without this the failure path
// logs through the Tauri logger, which has no window under the node env.
vi.mock("$lib/shared/adapters/tauri_invoke", () => ({
  tauri_invoke: vi.fn().mockResolvedValue(undefined),
}));

import { listen } from "@tauri-apps/api/event";
import { create_rag_mcp_bridge_reactor } from "$lib/reactors/rag_mcp_bridge.reactor.svelte";
import { resolve_assistant_provider } from "$lib/features/assistant";
import { UIStore } from "$lib/app/orchestration/ui_store.svelte";
import type { AiProviderConfig } from "$lib/shared/types/ai_provider_config";

const mock_listen = vi.mocked(listen);

const missing_cli: AiProviderConfig = {
  id: "codex",
  name: "Codex",
  transport: { kind: "cli", command: "codex", args: ["exec"] },
};

const present_cli: AiProviderConfig = {
  id: "claude",
  name: "Claude Code",
  transport: { kind: "cli", command: "claude", args: ["-p"] },
};

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function make_kernel(providers: AiProviderConfig[]) {
  return {
    resolve_provider: vi.fn(async (requested_id?: string) => {
      const resolution = await resolve_assistant_provider({
        providers,
        requested_id: requested_id ?? "auto",
        detect_status: (config) =>
          Promise.resolve(config.id === "codex" ? "missing" : "present"),
      });
      return resolution.status === "resolved" ? resolution.provider : null;
    }),
  };
}

function setup(providers: AiProviderConfig[]) {
  let handler: ((event: { payload: unknown }) => void) | undefined;
  const unlisten = vi.fn();
  mock_listen.mockImplementation((_name, fn) => {
    handler = fn as (event: { payload: unknown }) => void;
    return Promise.resolve(unlisten);
  });

  const rag_service = {
    query: vi.fn(() =>
      (async function* () {
        yield { type: "done" as const };
      })(),
    ),
  };
  const ui_store = new UIStore();
  ui_store.editor_settings.ai_providers = providers;
  ui_store.editor_settings.ai_default_provider_id = "auto";
  const assistant_kernel = make_kernel(providers);

  const cleanup = create_rag_mcp_bridge_reactor(
    rag_service as never,
    ui_store,
    assistant_kernel as never,
  );

  return {
    emit: (payload: unknown) => handler?.({ payload }),
    assistant_kernel,
    rag_service,
    cleanup,
  };
}

const query_event = {
  id: 1,
  question: "what is it?",
  folder: null,
  tag: null,
};

describe("rag mcp bridge reactor", () => {
  beforeEach(() => {
    mock_listen.mockReset();
  });

  // I3: the reactor used to hold a verbatim copy of the `providers[0]` rule and
  // would answer an MCP query with a provider whose CLI was not installed.
  it("resolves the provider through the kernel, skipping an unavailable one", async () => {
    const { emit, assistant_kernel, rag_service, cleanup } = setup([
      missing_cli,
      present_cli,
    ]);
    await flush();

    emit(query_event);
    await flush();

    expect(assistant_kernel.resolve_provider).toHaveBeenCalledWith("auto");
    expect(rag_service.query).toHaveBeenCalledWith(
      expect.objectContaining({
        provider_config: expect.objectContaining({ id: "claude" }),
      }),
    );
    cleanup();
  });

  it("answers with no provider rather than an unavailable one", async () => {
    const { emit, rag_service, cleanup } = setup([missing_cli]);
    await flush();

    emit(query_event);
    await flush();

    expect(rag_service.query).not.toHaveBeenCalled();
    cleanup();
  });

  it("ignores events after cleanup", async () => {
    const { emit, assistant_kernel, cleanup } = setup([present_cli]);
    await flush();

    cleanup();
    emit(query_event);
    await flush();

    expect(assistant_kernel.resolve_provider).not.toHaveBeenCalled();
  });
});
