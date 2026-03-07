import { describe, expect, it, vi } from "vitest";
import { WatcherService } from "$lib/features/watcher/application/watcher_service";
import { create_mock_watcher_port } from "../helpers/mock_ports";
import type { VaultId } from "$lib/shared/types/ids";

function setup() {
  const port = create_mock_watcher_port();
  const service = new WatcherService(port);
  return { port, service };
}

describe("WatcherService", () => {
  it("start calls watch_vault on port", async () => {
    const { port, service } = setup();

    await service.start("vault-1" as VaultId);

    expect(port._calls.watch_vault).toEqual(["vault-1"]);
  });

  it("stop calls unwatch_vault on port", async () => {
    const { port, service } = setup();

    await service.stop();

    expect(port._calls.unwatch_vault).toBe(1);
  });

  it("subscribe forwards events to handler", () => {
    const { port, service } = setup();
    const handler = vi.fn();

    service.subscribe(handler);
    port._emit({
      type: "note_added",
      vault_id: "v1",
      note_path: "test.md",
    });

    expect(handler).toHaveBeenCalledWith({
      type: "note_added",
      vault_id: "v1",
      note_path: "test.md",
    });
  });

  it("start after start stops previous watcher", async () => {
    const { port, service } = setup();

    await service.start("vault-1" as VaultId);
    await service.start("vault-2" as VaultId);

    expect(port._calls.unwatch_vault).toBe(2);
    expect(port._calls.watch_vault).toEqual(["vault-1", "vault-2"]);
  });

  it("start swallows watch_vault errors gracefully", async () => {
    const { port, service } = setup();
    port.watch_vault = () => Promise.reject(new Error("watch failed"));

    await expect(service.start("vault-1" as VaultId)).resolves.toBeUndefined();
  });

  it("stop swallows unwatch_vault errors gracefully", async () => {
    const { port, service } = setup();
    port.unwatch_vault = () => Promise.reject(new Error("unwatch failed"));

    await expect(service.stop()).resolves.toBeUndefined();
  });

  it("suppress_next marks path as suppressed", () => {
    const { service } = setup();

    service.suppress_next("notes/test.md");

    expect(service.consume_suppressed("notes/test.md")).toBe(true);
    expect(service.consume_suppressed("notes/test.md")).toBe(false);
  });

  it("consume_suppressed returns false for unknown path", () => {
    const { service } = setup();

    expect(service.consume_suppressed("notes/unknown.md")).toBe(false);
  });

  it("suppress_next resets timer on repeated calls", () => {
    vi.useFakeTimers();
    const { service } = setup();

    service.suppress_next("notes/test.md");
    vi.advanceTimersByTime(1500);
    service.suppress_next("notes/test.md");
    vi.advanceTimersByTime(1500);

    expect(service.consume_suppressed("notes/test.md")).toBe(true);
    vi.useRealTimers();
  });

  it("subscribe replaces previous subscription", () => {
    const { port, service } = setup();
    const handler_1 = vi.fn();
    const handler_2 = vi.fn();

    service.subscribe(handler_1);
    service.subscribe(handler_2);
    port._emit({
      type: "note_added",
      vault_id: "v1",
      note_path: "test.md",
    });

    expect(handler_1).not.toHaveBeenCalled();
    expect(handler_2).toHaveBeenCalledOnce();
  });
});
