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

  // One-shot: an arming covers a single self-write event. Anything after it is
  // a genuine external write (an agent editing on disk) and must get through.
  it("suppress_next suppresses exactly one event for the path", () => {
    const { service } = setup();

    service.suppress_next("notes/test.md");

    expect(service.is_suppressed("notes/test.md")).toBe(true);
    expect(service.is_suppressed("notes/test.md")).toBe(false);
  });

  it("re-arming after a consumed hit suppresses the next event again", () => {
    const { service } = setup();

    service.suppress_next("notes/test.md");
    service.is_suppressed("notes/test.md");
    service.suppress_next("notes/test.md");

    expect(service.is_suppressed("notes/test.md")).toBe(true);
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

  it("suppresses the atomic-write .tmp sibling of a suppressed path", () => {
    const { service } = setup();

    service.suppress_next("notes/test.md");

    expect(service.is_suppressed("notes/test.md.tmp")).toBe(true);
  });

  it("matches .tmp siblings case-insensitively", () => {
    const { service } = setup();

    service.suppress_next("Notes/Test.md");

    expect(service.is_suppressed("notes/test.md.TMP")).toBe(true);
  });

  it("does not suppress .tmp siblings of unsuppressed paths", () => {
    const { service } = setup();

    service.suppress_next("notes/test.md");

    expect(service.is_suppressed("notes/other.md.tmp")).toBe(false);
  });

  it(".tmp sibling suppression expires with the window", () => {
    vi.useFakeTimers();
    const { service } = setup();

    service.suppress_next("notes/test.md");
    vi.advanceTimersByTime(2_001);

    expect(service.is_suppressed("notes/test.md.tmp")).toBe(false);
    vi.useRealTimers();
  });

  // The staging event precedes the real one, so it must not eat the arming.
  it(".tmp sibling hit leaves the arming intact for the target path", () => {
    const { service } = setup();

    service.suppress_next("notes/test.md");

    expect(service.is_suppressed("notes/test.md.tmp")).toBe(true);
    expect(service.is_suppressed("notes/test.md")).toBe(true);
    expect(service.is_suppressed("notes/test.md")).toBe(false);
  });

  // The Create for a rename-into-place precedes the Modify, so it must not
  // eat the arming either.
  it("peek_suppressed reports the arming without consuming it", () => {
    const { service } = setup();

    service.suppress_next("notes/test.md");

    expect(service.peek_suppressed("notes/test.md")).toBe(true);
    expect(service.peek_suppressed("notes/test.md")).toBe(true);
    expect(service.is_suppressed("notes/test.md")).toBe(true);
    expect(service.peek_suppressed("notes/test.md")).toBe(false);
  });

  it("peek_suppressed is false for unknown paths and expired windows", () => {
    vi.useFakeTimers();
    const { service } = setup();

    expect(service.peek_suppressed("notes/test.md")).toBe(false);

    service.suppress_next("notes/test.md");
    vi.advanceTimersByTime(2_001);

    expect(service.peek_suppressed("notes/test.md")).toBe(false);
    vi.useRealTimers();
  });

  it("multiple suppress_next calls extend the suppression window", () => {
    vi.useFakeTimers();
    const { service } = setup();

    service.suppress_next("notes/test.md");
    vi.advanceTimersByTime(1_500);
    service.suppress_next("notes/test.md");
    vi.advanceTimersByTime(1_000);

    expect(service.is_suppressed("notes/test.md")).toBe(true);
    vi.useRealTimers();
  });

  // The Rust watcher debounces change events by up to MAX_DELAY (750ms) plus
  // one 200ms loop tick, so a self-write's own event can arrive that late. If
  // this ever fails, Carbide reads its own save as an external edit.
  it("still suppresses a self-write delayed by the backend debounce", () => {
    vi.useFakeTimers();
    const { service } = setup();

    service.suppress_next("notes/test.md");
    vi.advanceTimersByTime(950);

    expect(service.is_suppressed("notes/test.md")).toBe(true);
    vi.useRealTimers();
  });

  it("suppression expires after the window elapses", () => {
    vi.useFakeTimers();
    const { service } = setup();

    service.suppress_next("notes/test.md");
    vi.advanceTimersByTime(2_001);

    expect(service.is_suppressed("notes/test.md")).toBe(false);
    vi.useRealTimers();
  });

  // Regression: a blanket 10s mute swallowed every agent write that landed
  // shortly after an autosave, so the editor never learned about the edit.
  it("an external write after the self-write event is not suppressed", () => {
    vi.useFakeTimers();
    const { service } = setup();

    service.suppress_next("notes/test.md");
    expect(service.is_suppressed("notes/test.md")).toBe(true);

    vi.advanceTimersByTime(100);
    expect(service.is_suppressed("notes/test.md")).toBe(false);
    vi.useRealTimers();
  });

  // Diagnostics for the external-modification card. is_suppressed consumes the
  // entry it matches, so without a separate record the second event of one
  // write is indistinguishable from a genuine external edit in the log.
  it("arming_age_ms is null for a path that was never armed", () => {
    const { service } = setup();

    expect(service.arming_age_ms("notes/test.md")).toBeNull();
  });

  it("arming_age_ms reports the age of the most recent arming", () => {
    vi.useFakeTimers();
    const { service } = setup();

    service.suppress_next("notes/test.md");
    vi.advanceTimersByTime(400);

    expect(service.arming_age_ms("notes/test.md")).toBe(400);
    vi.useRealTimers();
  });

  it("arming_age_ms survives the arming being consumed", () => {
    vi.useFakeTimers();
    const { service } = setup();

    service.suppress_next("notes/test.md");
    expect(service.is_suppressed("notes/test.md")).toBe(true);
    vi.advanceTimersByTime(50);

    expect(service.is_suppressed("notes/test.md")).toBe(false);
    expect(service.arming_age_ms("notes/test.md")).toBe(50);
    vi.useRealTimers();
  });

  // The diagnostically interesting case: an event that missed the suppression
  // window entirely still has to be traceable back to Carbide's own save.
  it("arming_age_ms outlives the suppression window", () => {
    vi.useFakeTimers();
    const { service } = setup();

    service.suppress_next("notes/test.md");
    vi.advanceTimersByTime(2_500);

    expect(service.is_suppressed("notes/test.md")).toBe(false);
    expect(service.arming_age_ms("notes/test.md")).toBe(2_500);
    vi.useRealTimers();
  });

  it("arming_age_ms is null once the diagnostic horizon has passed", () => {
    vi.useFakeTimers();
    const { service } = setup();

    service.suppress_next("notes/test.md");
    vi.advanceTimersByTime(30_001);

    expect(service.arming_age_ms("notes/test.md")).toBeNull();
    vi.useRealTimers();
  });

  it("arming_age_ms matches paths case-insensitively", () => {
    vi.useFakeTimers();
    const { service } = setup();

    service.suppress_next("Notes/Test.md");
    vi.advanceTimersByTime(10);

    expect(service.arming_age_ms("notes/test.md")).toBe(10);
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

  it("suppress_tree_refresh sets is_tree_refresh_suppressed to true", () => {
    const { service } = setup();

    service.suppress_tree_refresh();

    expect(service.is_tree_refresh_suppressed).toBe(true);
  });

  it("resume_tree_refresh sets is_tree_refresh_suppressed to false", () => {
    const { service } = setup();

    service.suppress_tree_refresh();
    service.resume_tree_refresh();

    expect(service.is_tree_refresh_suppressed).toBe(false);
  });

  it("is_tree_refresh_suppressed is false by default", () => {
    const { service } = setup();

    expect(service.is_tree_refresh_suppressed).toBe(false);
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
