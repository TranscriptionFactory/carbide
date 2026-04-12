import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(),
}));

import { create_plugin_metadata_events_reactor } from "$lib/reactors/plugin_metadata_events.reactor.svelte";
import * as tauri_event from "@tauri-apps/api/event";
import type { PluginService } from "$lib/features/plugin";

interface MetadataChangedPayload {
  event_type: "upsert" | "rename" | "delete";
  vault_id: string;
  path: string;
  old_path?: string;
}

function make_vault_store(vault_id: string | null) {
  return {
    vault: vault_id ? { id: vault_id, path: "/vault" } : null,
  } as never;
}

function make_plugin_service() {
  return {
    emit_plugin_event: vi.fn(),
  } as unknown as PluginService;
}

describe("plugin_metadata_events.reactor", () => {
  let captured_callback:
    | ((event: { payload: MetadataChangedPayload }) => void)
    | null;
  let unlisten_fn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    captured_callback = null;
    unlisten_fn = vi.fn();
    vi.mocked(tauri_event.listen).mockImplementation((_event, callback) => {
      captured_callback = callback as typeof captured_callback;
      return Promise.resolve(unlisten_fn);
    });
  });

  it("returns a cleanup function", () => {
    const unmount = create_plugin_metadata_events_reactor(
      make_vault_store("v1"),
      make_plugin_service(),
    );
    expect(typeof unmount).toBe("function");
    unmount();
  });

  it("listens to metadata-changed Tauri event", async () => {
    const unmount = create_plugin_metadata_events_reactor(
      make_vault_store("v1"),
      make_plugin_service(),
    );

    await Promise.resolve();
    await Promise.resolve();

    expect(tauri_event.listen).toHaveBeenCalledWith(
      "metadata-changed",
      expect.any(Function),
    );

    unmount();
  });

  it("forwards upsert events to plugin_service.emit_plugin_event", async () => {
    const plugin_service = make_plugin_service();
    create_plugin_metadata_events_reactor(
      make_vault_store("v1"),
      plugin_service,
    );

    await Promise.resolve();
    await Promise.resolve();

    captured_callback!({
      payload: {
        event_type: "upsert",
        vault_id: "v1",
        path: "notes/test.md",
      },
    });

    expect(plugin_service.emit_plugin_event).toHaveBeenCalledWith(
      "metadata-changed",
      {
        event_type: "upsert",
        path: "notes/test.md",
        old_path: undefined,
      },
    );
  });

  it("forwards rename events with old_path", async () => {
    const plugin_service = make_plugin_service();
    create_plugin_metadata_events_reactor(
      make_vault_store("v1"),
      plugin_service,
    );

    await Promise.resolve();
    await Promise.resolve();

    captured_callback!({
      payload: {
        event_type: "rename",
        vault_id: "v1",
        path: "notes/new.md",
        old_path: "notes/old.md",
      },
    });

    expect(plugin_service.emit_plugin_event).toHaveBeenCalledWith(
      "metadata-changed",
      {
        event_type: "rename",
        path: "notes/new.md",
        old_path: "notes/old.md",
      },
    );
  });

  it("ignores events from a different vault", async () => {
    const plugin_service = make_plugin_service();
    create_plugin_metadata_events_reactor(
      make_vault_store("v1"),
      plugin_service,
    );

    await Promise.resolve();
    await Promise.resolve();

    captured_callback!({
      payload: {
        event_type: "upsert",
        vault_id: "other-vault",
        path: "notes/test.md",
      },
    });

    expect(plugin_service.emit_plugin_event).not.toHaveBeenCalled();
  });

  it("does not forward events after cleanup", async () => {
    const plugin_service = make_plugin_service();
    const unmount = create_plugin_metadata_events_reactor(
      make_vault_store("v1"),
      plugin_service,
    );

    await Promise.resolve();
    await Promise.resolve();

    unmount();

    captured_callback!({
      payload: {
        event_type: "delete",
        vault_id: "v1",
        path: "notes/test.md",
      },
    });

    expect(plugin_service.emit_plugin_event).not.toHaveBeenCalled();
  });
});
