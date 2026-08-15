/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync } from "svelte";
import { create_task_sync_reactor } from "$lib/reactors/task_sync.reactor.svelte";
import type { VaultFsEvent } from "$lib/features/watcher";
import { WatcherService } from "$lib/features/watcher/application/watcher_service";
import { VaultStore } from "$lib/features/vault/state/vault_store.svelte";
import { create_mock_watcher_port } from "../helpers/mock_ports";
import { create_test_vault } from "../helpers/test_fixtures";

const VAULT_ID = "vault-1";
const NOTE_PATH = "notes/a.md";
const TASK_REFRESH_DEBOUNCE_MS = 500;

function changed_event(
  note_path: string,
  mtime_ms: number | null = null,
): VaultFsEvent {
  return {
    type: "note_changed_externally",
    vault_id: VAULT_ID,
    note_path,
    mtime_ms,
  };
}

function added_event(note_path: string): VaultFsEvent {
  return { type: "note_added", vault_id: VAULT_ID, note_path };
}

function removed_event(note_path: string): VaultFsEvent {
  return { type: "note_removed", vault_id: VAULT_ID, note_path };
}

function asset_event(asset_path: string): VaultFsEvent {
  return { type: "asset_changed", vault_id: VAULT_ID, asset_path };
}

async function flush_effects() {
  flushSync();
  for (let i = 0; i < 5; i += 1) {
    await Promise.resolve();
  }
}

// watcher.reactor is what calls WatcherService.start in production, so the
// port has to be wired here for emitted events to reach any subscriber.
async function mount_reactor() {
  const vault_store = new VaultStore();
  const watcher_port = create_mock_watcher_port();
  const watcher_service = new WatcherService(watcher_port);
  const task_service = { refreshTasks: vi.fn().mockResolvedValue(undefined) };

  const vault = create_test_vault();
  vault_store.set_vault(vault);
  await watcher_service.start(vault.id);

  const unmount = create_task_sync_reactor(
    vault_store,
    task_service as never,
    watcher_service,
  );
  await flush_effects();

  return { watcher_port, watcher_service, task_service, unmount };
}

function settle_debounce() {
  vi.advanceTimersByTime(TASK_REFRESH_DEBOUNCE_MS);
}

describe("task_sync_reactor", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("refreshes tasks on a genuine external markdown change", async () => {
    const t = await mount_reactor();

    t.watcher_port._emit(changed_event(NOTE_PATH));
    settle_debounce();

    expect(t.task_service.refreshTasks).toHaveBeenCalledTimes(1);
    t.unmount();
  });

  it("does not refresh tasks for a self-write change", async () => {
    const t = await mount_reactor();

    t.watcher_service.suppress_next(NOTE_PATH);
    t.watcher_port._emit(changed_event(NOTE_PATH));
    settle_debounce();

    expect(t.task_service.refreshTasks).not.toHaveBeenCalled();
    t.unmount();
  });

  // The tmp→target rename of an atomic self-write surfaces as a Create, so
  // note_added has to be filtered by the same arming as the Modify.
  it("does not refresh tasks for the note_added of a self-write", async () => {
    const t = await mount_reactor();

    t.watcher_service.suppress_next(NOTE_PATH);
    t.watcher_port._emit(added_event(NOTE_PATH));
    settle_debounce();

    expect(t.task_service.refreshTasks).not.toHaveBeenCalled();
    t.unmount();
  });

  // One save surfaces as several events. The arming must survive the whole
  // burst, or the trailing event refreshes and the filter buys nothing.
  it("does not refresh tasks for any event of one self-write burst", async () => {
    const t = await mount_reactor();

    t.watcher_service.suppress_next(NOTE_PATH);
    t.watcher_port._emit(changed_event(NOTE_PATH));
    t.watcher_port._emit(added_event(NOTE_PATH));
    t.watcher_port._emit(changed_event(NOTE_PATH));
    settle_debounce();

    expect(t.task_service.refreshTasks).not.toHaveBeenCalled();
    t.unmount();
  });

  // The arming is watcher.reactor's to spend. Peeking here must leave it
  // intact, or whichever reactor runs second reads its own self-write as an
  // external edit.
  it("leaves the suppression arming intact for other subscribers", async () => {
    const t = await mount_reactor();

    t.watcher_service.suppress_next(NOTE_PATH);
    t.watcher_port._emit(changed_event(NOTE_PATH));
    settle_debounce();

    expect(t.watcher_service.peek_suppressed(NOTE_PATH)).toBe(true);
    t.unmount();
  });

  it("refreshes tasks once a self-write arming has been spent elsewhere", async () => {
    const t = await mount_reactor();

    t.watcher_service.suppress_next(NOTE_PATH);
    t.watcher_service.is_suppressed(NOTE_PATH, { kind: "change" });
    t.watcher_port._emit(changed_event(NOTE_PATH));
    settle_debounce();

    expect(t.task_service.refreshTasks).toHaveBeenCalledTimes(1);
    t.unmount();
  });

  it("refreshes tasks on an external note removal", async () => {
    const t = await mount_reactor();

    t.watcher_port._emit(removed_event(NOTE_PATH));
    settle_debounce();

    expect(t.task_service.refreshTasks).toHaveBeenCalledTimes(1);
    t.unmount();
  });

  it("ignores non-markdown events", async () => {
    const t = await mount_reactor();

    t.watcher_port._emit(asset_event("assets/a.png"));
    settle_debounce();

    expect(t.task_service.refreshTasks).not.toHaveBeenCalled();
    t.unmount();
  });

  it("ignores events for a different vault", async () => {
    const t = await mount_reactor();

    t.watcher_port._emit({
      type: "note_changed_externally",
      vault_id: "vault-2",
      note_path: NOTE_PATH,
      mtime_ms: null,
    });
    settle_debounce();

    expect(t.task_service.refreshTasks).not.toHaveBeenCalled();
    t.unmount();
  });
});
