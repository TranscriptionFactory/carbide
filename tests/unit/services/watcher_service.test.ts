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

  it("subscribe forwards events to handler after start", async () => {
    const { port, service } = setup();
    const handler = vi.fn();

    service.subscribe(handler);
    await service.start("v1" as VaultId);
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

  it("suppress_next marks path as suppressed and token is consumed on first check", () => {
    const { service } = setup();

    service.suppress_next("notes/test.md");

    expect(service.is_suppressed("notes/test.md")).toBe(true);
    expect(service.is_suppressed("notes/test.md")).toBe(false);
  });

  it("is_suppressed returns false for unknown path", () => {
    const { service } = setup();

    expect(service.is_suppressed("notes/unknown.md")).toBe(false);
  });

  it("matches suppressed paths case-insensitively", () => {
    const { service } = setup();

    service.suppress_next("Notes/Test.md");

    expect(service.is_suppressed("notes/test.md")).toBe(true);
  });

  it("multiple suppress_next calls stack and each is_suppressed consumes one token", () => {
    const { service } = setup();

    service.suppress_next("notes/test.md");
    service.suppress_next("notes/test.md");

    expect(service.is_suppressed("notes/test.md")).toBe(true);
    expect(service.is_suppressed("notes/test.md")).toBe(true);
    expect(service.is_suppressed("notes/test.md")).toBe(false);
  });

  it("fallback timeout clears stale tokens after 10s", () => {
    vi.useFakeTimers();
    const { service } = setup();

    service.suppress_next("notes/test.md");
    vi.advanceTimersByTime(10_001);

    expect(service.is_suppressed("notes/test.md")).toBe(false);
    vi.useRealTimers();
  });

  it("fallback timeout decrements count when multiple tokens are stacked", () => {
    vi.useFakeTimers();
    const { service } = setup();

    service.suppress_next("notes/test.md");
    vi.advanceTimersByTime(1_000);
    service.suppress_next("notes/test.md");
    vi.advanceTimersByTime(9_001);

    expect(service.is_suppressed("notes/test.md")).toBe(true);
    expect(service.is_suppressed("notes/test.md")).toBe(false);
    vi.useRealTimers();
  });

  it("supports multiple concurrent subscribers", async () => {
    const { port, service } = setup();
    const handler_1 = vi.fn();
    const handler_2 = vi.fn();

    service.subscribe(handler_1);
    service.subscribe(handler_2);
    await service.start("v1" as VaultId);
    port._emit({
      type: "note_added",
      vault_id: "v1",
      note_path: "test.md",
    });

    expect(handler_1).toHaveBeenCalledOnce();
    expect(handler_2).toHaveBeenCalledOnce();
  });

  it("unsubscribe removes handler", async () => {
    const { port, service } = setup();
    const handler = vi.fn();

    const unsub = service.subscribe(handler);
    await service.start("v1" as VaultId);
    unsub();
    port._emit({
      type: "note_added",
      vault_id: "v1",
      note_path: "test.md",
    });

    expect(handler).not.toHaveBeenCalled();
  });

  it("serializes stop before a later start", async () => {
    const calls: string[] = [];
    let resolve_first_unwatch: (() => void) | null = null;
    let unwatch_count = 0;
    const deferred_port = {
      watch_vault: vi.fn((vault_id: VaultId) => {
        calls.push(`watch:${String(vault_id)}`);
        return Promise.resolve();
      }),
      unwatch_vault: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            unwatch_count += 1;
            if (unwatch_count === 1) {
              resolve_first_unwatch = () => {
                calls.push("unwatch");
                resolve();
              };
              return;
            }
            calls.push("unwatch");
            resolve();
          }),
      ),
      subscribe_fs_events: vi.fn(() => () => {}),
    };
    const deferred_service = new WatcherService(deferred_port);

    const stop_promise = deferred_service.stop();
    const start_promise = deferred_service.start("vault-2" as VaultId);
    await Promise.resolve();

    expect(deferred_port.watch_vault).not.toHaveBeenCalled();

    const release_first_unwatch = resolve_first_unwatch;
    if (typeof release_first_unwatch !== "function") {
      throw new Error("expected first unwatch to be pending");
    }
    (release_first_unwatch as () => void)();
    await stop_promise;
    await start_promise;

    expect(calls).toEqual(["unwatch", "unwatch", "watch:vault-2"]);
  });
});
