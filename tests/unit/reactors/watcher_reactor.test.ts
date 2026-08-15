/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync } from "svelte";
import {
  create_watcher_reactor,
  resolve_graph_invalidation,
  resolve_watcher_event_decision,
} from "$lib/reactors/watcher.reactor.svelte";
import type { VaultFsEvent } from "$lib/features/watcher";
import { WatcherService } from "$lib/features/watcher/application/watcher_service";
import type { BackgroundTabInfo } from "$lib/reactors/watcher.reactor.svelte";
import { VaultStore } from "$lib/features/vault/state/vault_store.svelte";
import { EditorStore } from "$lib/features/editor/state/editor_store.svelte";
import { TabStore } from "$lib/features/tab/state/tab_store.svelte";
import { as_markdown_text, as_note_path } from "$lib/shared/types/ids";
import { create_mock_watcher_port } from "../helpers/mock_ports";
import { create_test_vault } from "../helpers/test_fixtures";

const VAULT_ID = "vault-1";
const NO_BG_TAB = () => null;

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

function added_event(
  note_path: string,
  mtime_ms: number | null = null,
): VaultFsEvent {
  return { type: "note_added", vault_id: VAULT_ID, note_path, mtime_ms };
}

function removed_event(note_path: string): VaultFsEvent {
  return { type: "note_removed", vault_id: VAULT_ID, note_path };
}

function asset_event(asset_path: string): VaultFsEvent {
  return { type: "asset_changed", vault_id: VAULT_ID, asset_path };
}

function folder_created_event(folder_path: string): VaultFsEvent {
  return { type: "folder_created", vault_id: VAULT_ID, folder_path };
}

function folder_removed_event(folder_path: string): VaultFsEvent {
  return { type: "folder_removed", vault_id: VAULT_ID, folder_path };
}

function bg_tab(is_dirty: boolean): () => BackgroundTabInfo {
  return () => ({ is_dirty });
}

async function flush_effects() {
  flushSync();
  for (let i = 0; i < 5; i += 1) {
    await Promise.resolve();
  }
}

// is_dirty is set explicitly rather than derived from a simulated save: after
// the save-baseline change a buffer the user typed through is legitimately
// dirty the instant the write completes, so deriving it would assert a state
// nothing guarantees.
function mount_reactor(options: { is_dirty: boolean; note_path?: string }) {
  const note_path = options.note_path ?? "notes/a.md";
  const vault_store = new VaultStore();
  const editor_store = new EditorStore();
  const tab_store = new TabStore();
  const watcher_port = create_mock_watcher_port();
  const watcher_service = new WatcherService(watcher_port);
  const note_service = {
    open_note: vi.fn(),
    clear_open_note: vi.fn(),
  };
  const tab_service = {
    invalidate_cache: vi.fn(),
    mark_conflict: vi.fn(),
    remove_tab: vi.fn(),
    sync_dirty_state: vi.fn(),
  };
  const action_registry = { execute: vi.fn() };
  const workspace_reconcile = vi.fn().mockResolvedValue(undefined);
  const graph_service = {
    invalidate_cache: vi.fn().mockResolvedValue(undefined),
  };

  vault_store.set_vault(create_test_vault());
  editor_store.set_open_note({
    meta: {
      id: as_note_path(note_path),
      path: as_note_path(note_path),
      name: "a",
      title: "A",
      blurb: "",
      mtime_ms: 0,
      ctime_ms: 0,
      size_bytes: 0,
      file_type: null,
    },
    markdown: as_markdown_text("# A"),
    buffer_id: note_path,
    is_dirty: options.is_dirty,
  });

  const unmount = create_watcher_reactor(
    vault_store,
    editor_store,
    tab_store,
    tab_service as never,
    note_service as never,
    watcher_service,
    action_registry as never,
    graph_service as never,
    workspace_reconcile,
  );

  return {
    note_path,
    watcher_port,
    watcher_service,
    note_service,
    tab_service,
    workspace_reconcile,
    graph_service,
    unmount,
  };
}

describe("watcher_reactor", () => {
  describe("note_changed_externally", () => {
    it("reloads clean open note", () => {
      const decision = resolve_watcher_event_decision(
        changed_event("notes/a.md"),
        VAULT_ID,
        "notes/a.md",
        false,
        NO_BG_TAB,
      );
      expect(decision).toEqual({
        action: "reload",
        note_path: "notes/a.md",
        affects_index: true,
        index_hint: { changed: "notes/a.md" },
      });
    });

    it("marks conflict for dirty open note", () => {
      const decision = resolve_watcher_event_decision(
        changed_event("notes/a.md"),
        VAULT_ID,
        "notes/a.md",
        true,
        NO_BG_TAB,
      );
      expect(decision).toEqual({
        action: "mark_conflict",
        note_path: "notes/a.md",
        affects_index: true,
        index_hint: { changed: "notes/a.md" },
      });
    });

    it("leaves the editor alone but still indexes when no note is open", () => {
      const decision = resolve_watcher_event_decision(
        changed_event("notes/a.md"),
        VAULT_ID,
        null,
        false,
        NO_BG_TAB,
      );
      expect(decision).toEqual({
        action: "ignore",
        affects_index: true,
        index_hint: { changed: "notes/a.md" },
      });
    });

    it("leaves the editor alone but still indexes when a different note is open", () => {
      const decision = resolve_watcher_event_decision(
        changed_event("notes/a.md"),
        VAULT_ID,
        "notes/b.md",
        false,
        NO_BG_TAB,
      );
      expect(decision).toEqual({
        action: "ignore",
        affects_index: true,
        index_hint: { changed: "notes/a.md" },
      });
    });

    it("matches paths case-insensitively", () => {
      const decision = resolve_watcher_event_decision(
        changed_event("Notes/A.md"),
        VAULT_ID,
        "notes/a.md",
        false,
        NO_BG_TAB,
      );
      expect(decision).toEqual({
        action: "reload",
        note_path: "Notes/A.md",
        affects_index: true,
        index_hint: { changed: "Notes/A.md" },
      });
    });
  });

  describe("background tabs", () => {
    it("invalidates cache for clean background tab", () => {
      const decision = resolve_watcher_event_decision(
        changed_event("notes/bg.md"),
        VAULT_ID,
        "notes/active.md",
        false,
        bg_tab(false),
      );
      expect(decision).toEqual({
        action: "invalidate_tab_cache",
        note_path: "notes/bg.md",
        affects_index: true,
        index_hint: { changed: "notes/bg.md" },
      });
    });

    it("marks conflict for dirty background tab", () => {
      const decision = resolve_watcher_event_decision(
        changed_event("notes/bg.md"),
        VAULT_ID,
        "notes/active.md",
        false,
        bg_tab(true),
      );
      expect(decision).toEqual({
        action: "mark_conflict",
        note_path: "notes/bg.md",
        affects_index: true,
        index_hint: { changed: "notes/bg.md" },
      });
    });

    it("prefers active note match over background tab", () => {
      const decision = resolve_watcher_event_decision(
        changed_event("notes/a.md"),
        VAULT_ID,
        "notes/a.md",
        false,
        bg_tab(true),
      );
      expect(decision).toEqual({
        action: "reload",
        note_path: "notes/a.md",
        affects_index: true,
        index_hint: { changed: "notes/a.md" },
      });
    });

    it("indexes without touching the editor when no note is open and no background tab", () => {
      const decision = resolve_watcher_event_decision(
        changed_event("notes/x.md"),
        VAULT_ID,
        null,
        false,
        NO_BG_TAB,
      );
      expect(decision).toEqual({
        action: "ignore",
        affects_index: true,
        index_hint: { changed: "notes/x.md" },
      });
    });
  });

  describe("note_added", () => {
    it("triggers debounced tree refresh", () => {
      const decision = resolve_watcher_event_decision(
        added_event("notes/new.md"),
        VAULT_ID,
        "notes/a.md",
        false,
        NO_BG_TAB,
      );
      expect(decision).toEqual({
        action: "refresh_tree",
        affects_index: true,
        index_hint: { changed: "notes/new.md" },
      });
    });
  });

  describe("note_removed", () => {
    it("clears editor and refreshes tree for open note", () => {
      const decision = resolve_watcher_event_decision(
        removed_event("notes/a.md"),
        VAULT_ID,
        "notes/a.md",
        false,
        NO_BG_TAB,
      );
      expect(decision).toEqual({
        action: "clear_and_refresh",
        note_path: "notes/a.md",
        affects_index: true,
      });
    });

    it("just refreshes tree for non-open note without background tab", () => {
      const decision = resolve_watcher_event_decision(
        removed_event("notes/other.md"),
        VAULT_ID,
        "notes/a.md",
        false,
        NO_BG_TAB,
      );
      expect(decision).toEqual({
        action: "refresh_tree",
        affects_index: true,
        index_hint: { removed: "notes/other.md" },
      });
    });

    it("removes background tab and refreshes tree for deleted background note", () => {
      const decision = resolve_watcher_event_decision(
        removed_event("notes/bg.md"),
        VAULT_ID,
        "notes/active.md",
        false,
        bg_tab(false),
      );
      expect(decision).toEqual({
        action: "remove_background_tab_and_refresh",
        note_path: "notes/bg.md",
        affects_index: true,
      });
    });

    it("marks conflict instead of clearing a dirty open note", () => {
      const decision = resolve_watcher_event_decision(
        removed_event("notes/a.md"),
        VAULT_ID,
        "notes/a.md",
        true,
        NO_BG_TAB,
      );
      expect(decision).toEqual({
        action: "mark_conflict",
        note_path: "notes/a.md",
      });
    });

    it("marks conflict instead of removing a dirty background tab", () => {
      const decision = resolve_watcher_event_decision(
        removed_event("notes/bg.md"),
        VAULT_ID,
        "notes/active.md",
        false,
        bg_tab(true),
      );
      expect(decision).toEqual({
        action: "mark_conflict",
        note_path: "notes/bg.md",
      });
    });
  });

  describe("asset_changed", () => {
    it("returns log_only", () => {
      const decision = resolve_watcher_event_decision(
        asset_event(".assets/img.png"),
        VAULT_ID,
        null,
        false,
        NO_BG_TAB,
      );
      expect(decision).toEqual({
        action: "log_only",
        path: ".assets/img.png",
      });
    });

    it("refreshes the tree for ignore file changes", () => {
      const decision = resolve_watcher_event_decision(
        asset_event(".vaultignore"),
        VAULT_ID,
        null,
        false,
        NO_BG_TAB,
      );
      expect(decision).toEqual({
        action: "refresh_tree",
        affects_index: true,
      });
    });
  });

  describe("folder_created", () => {
    it("triggers tree refresh without index sync", () => {
      const decision = resolve_watcher_event_decision(
        folder_created_event("notes/subfolder"),
        VAULT_ID,
        "notes/a.md",
        false,
        NO_BG_TAB,
      );
      expect(decision).toEqual({
        action: "refresh_tree",
        affects_index: false,
      });
    });
  });

  describe("folder_removed", () => {
    it("triggers tree refresh without index sync", () => {
      const decision = resolve_watcher_event_decision(
        folder_removed_event("notes/subfolder"),
        VAULT_ID,
        "notes/a.md",
        false,
        NO_BG_TAB,
      );
      expect(decision).toEqual({
        action: "refresh_tree",
        affects_index: false,
      });
    });
  });

  describe("stale vault_id", () => {
    it("ignores events from different vault", () => {
      const decision = resolve_watcher_event_decision(
        changed_event("notes/a.md"),
        "other-vault",
        "notes/a.md",
        false,
        NO_BG_TAB,
      );
      expect(decision).toEqual({ action: "ignore" });
    });

    it("ignores when no vault is active", () => {
      const decision = resolve_watcher_event_decision(
        changed_event("notes/a.md"),
        null,
        "notes/a.md",
        false,
        NO_BG_TAB,
      );
      expect(decision).toEqual({ action: "ignore" });
    });
  });

  // The Rust watcher already coalesces per-path change events to one per 500ms,
  // so a second event is a genuine external write (an agent editing on disk)
  // and must reload rather than be swallowed by the previous arming.
  // This is the FALLBACK contract, for events that carry no mtime. Events that
  // do carry one are matched by identity instead - see the mtime tests below,
  // which are what actually closes the several-events-per-write case.
  it("suppresses only the mtime-less self-write event and reloads on the next one", async () => {
    const vault_store = new VaultStore();
    const editor_store = new EditorStore();
    const tab_store = new TabStore();
    const watcher_port = create_mock_watcher_port();
    const watcher_service = new WatcherService(watcher_port);
    const note_service = {
      open_note: vi.fn(),
      clear_open_note: vi.fn(),
    };
    const tab_service = {
      invalidate_cache: vi.fn(),
      mark_conflict: vi.fn(),
      remove_tab: vi.fn(),
      sync_dirty_state: vi.fn(),
    };
    const action_registry = {
      execute: vi.fn(),
    };
    const workspace_reconcile = vi.fn().mockResolvedValue(undefined);
    const graph_service = {
      invalidate_cache: vi.fn().mockResolvedValue(undefined),
    };

    vault_store.set_vault(create_test_vault());
    editor_store.set_open_note({
      meta: {
        id: as_note_path("notes/a.md"),
        path: as_note_path("notes/a.md"),
        name: "a",
        title: "A",
        blurb: "",
        mtime_ms: 0,
        ctime_ms: 0,
        size_bytes: 0,
        file_type: null,
      },
      markdown: as_markdown_text("# A"),
      buffer_id: "notes/a.md",
      is_dirty: false,
    });

    const unmount = create_watcher_reactor(
      vault_store,
      editor_store,
      tab_store,
      tab_service as never,
      note_service as never,
      watcher_service,
      action_registry as never,
      graph_service as never,
      workspace_reconcile,
    );

    await flush_effects();

    watcher_service.suppress_next("notes/a.md");
    watcher_port._emit(changed_event("notes/a.md"));

    await flush_effects();

    expect(note_service.open_note).not.toHaveBeenCalled();
    expect(tab_service.mark_conflict).not.toHaveBeenCalled();

    watcher_port._emit(changed_event("notes/a.md"));

    await flush_effects();

    expect(note_service.open_note).toHaveBeenCalledWith("notes/a.md", false, {
      force_reload: true,
    });
    expect(graph_service.invalidate_cache).toHaveBeenCalledTimes(1);
    expect(graph_service.invalidate_cache).toHaveBeenCalledWith("notes/a.md");

    unmount();
  });

  // The arity bug, and the contract that replaces counting. One write can
  // surface as several Modify deliveries; every one of them reports the mtime
  // Carbide wrote, so identity swallows all of them where a single token
  // swallowed only the first.
  it("swallows every event of one write that reports the mtime Carbide wrote", async () => {
    const t = mount_reactor({ is_dirty: true });
    await flush_effects();

    t.watcher_service.record_self_write(t.note_path, 5_000);
    t.watcher_port._emit(changed_event(t.note_path, 5_000));
    t.watcher_port._emit(changed_event(t.note_path, 5_000));
    t.watcher_port._emit(changed_event(t.note_path, 5_000));

    await flush_effects();

    expect(t.tab_service.mark_conflict).not.toHaveBeenCalled();
    expect(t.note_service.open_note).not.toHaveBeenCalled();
    t.unmount();
  });

  // The force-drain in the Rust debouncer emits a held Modify ahead of the
  // structural event, so a real save arrives as changed → added → changed.
  // Consecutive Modifys coalesce, so this split is what actually produces a
  // second delivery - and it is the shape the card was appearing on.
  it("swallows a write delivered as changed, added, changed around a force-drain", async () => {
    const t = mount_reactor({ is_dirty: true });
    await flush_effects();

    t.watcher_service.suppress_next(t.note_path);
    t.watcher_service.record_self_write(t.note_path, 7_000);
    t.watcher_port._emit(changed_event(t.note_path, 7_000));
    t.watcher_port._emit(added_event(t.note_path));
    t.watcher_port._emit(changed_event(t.note_path, 7_000));

    await flush_effects();

    expect(t.tab_service.mark_conflict).not.toHaveBeenCalled();
    expect(t.note_service.open_note).not.toHaveBeenCalled();
    expect(t.workspace_reconcile).not.toHaveBeenCalled();
    t.unmount();
  });

  // Over-suppression is the worse bug, so this gets its own test rather than a
  // negative assertion bolted onto the one above.
  it("still raises the card for an external edit landing right after a save", async () => {
    const t = mount_reactor({ is_dirty: true });
    await flush_effects();

    t.watcher_service.record_self_write(t.note_path, 5_000);
    t.watcher_port._emit(changed_event(t.note_path, 5_000));

    await flush_effects();
    expect(t.tab_service.mark_conflict).not.toHaveBeenCalled();

    t.watcher_port._emit(changed_event(t.note_path, 6_000));

    await flush_effects();

    expect(t.tab_service.mark_conflict).toHaveBeenCalledWith(
      as_note_path(t.note_path),
    );
    t.unmount();
  });

  it("reloads a clean buffer on an external edit after a save", async () => {
    const t = mount_reactor({ is_dirty: false });
    await flush_effects();

    t.watcher_service.record_self_write(t.note_path, 5_000);
    t.watcher_port._emit(changed_event(t.note_path, 6_000));

    await flush_effects();

    expect(t.note_service.open_note).toHaveBeenCalledWith(t.note_path, false, {
      force_reload: true,
    });
    t.unmount();
  });

  it("suppresses the note_removed of a Carbide-initiated delete", async () => {
    const t = mount_reactor({ is_dirty: true });
    await flush_effects();

    t.watcher_service.suppress_next(t.note_path, ["removal"]);
    t.watcher_port._emit(removed_event(t.note_path));

    await flush_effects();

    expect(t.tab_service.mark_conflict).not.toHaveBeenCalled();
    expect(t.note_service.clear_open_note).not.toHaveBeenCalled();
    expect(t.tab_service.remove_tab).not.toHaveBeenCalled();
    t.unmount();
  });

  // Regression guard for the armings that rewrite a file rather than delete it
  // (git discard, link repair, save). If a change arming also silenced
  // removals, a discarded note would keep an open tab pointing at a path that
  // no longer exists.
  it("does not let a change arming swallow a note_removed", async () => {
    const t = mount_reactor({ is_dirty: false });
    await flush_effects();

    t.watcher_service.suppress_next(t.note_path);
    t.watcher_port._emit(removed_event(t.note_path));

    await flush_effects();

    expect(t.note_service.clear_open_note).toHaveBeenCalled();
    expect(t.tab_service.remove_tab).toHaveBeenCalledWith(
      as_note_path(t.note_path),
    );
    t.unmount();
  });

  // atomic_write finishes with a tmp→target rename that FSEvents can classify
  // as a Create. The resulting note_added must be swallowed (no tree refresh /
  // index sync per save) without consuming the arming, which still has to
  // catch the Modify event for the same write.
  it("suppresses a self-write note_added and keeps the arming for the Modify", async () => {
    const vault_store = new VaultStore();
    const editor_store = new EditorStore();
    const tab_store = new TabStore();
    const watcher_port = create_mock_watcher_port();
    const watcher_service = new WatcherService(watcher_port);
    const note_service = {
      open_note: vi.fn(),
      clear_open_note: vi.fn(),
    };
    const tab_service = {
      invalidate_cache: vi.fn(),
      mark_conflict: vi.fn(),
      remove_tab: vi.fn(),
      sync_dirty_state: vi.fn(),
    };
    const action_registry = {
      execute: vi.fn(),
    };
    const workspace_reconcile = vi.fn().mockResolvedValue(undefined);
    const graph_service = {
      invalidate_cache: vi.fn().mockResolvedValue(undefined),
    };

    vault_store.set_vault(create_test_vault());
    editor_store.set_open_note({
      meta: {
        id: as_note_path("notes/a.md"),
        path: as_note_path("notes/a.md"),
        name: "a",
        title: "A",
        blurb: "",
        mtime_ms: 0,
        ctime_ms: 0,
        size_bytes: 0,
        file_type: null,
      },
      markdown: as_markdown_text("# A"),
      buffer_id: "notes/a.md",
      is_dirty: false,
    });

    const unmount = create_watcher_reactor(
      vault_store,
      editor_store,
      tab_store,
      tab_service as never,
      note_service as never,
      watcher_service,
      action_registry as never,
      graph_service as never,
      workspace_reconcile,
    );

    await flush_effects();

    watcher_service.suppress_next("notes/a.md");
    watcher_port._emit(added_event("notes/a.md"));
    watcher_port._emit(changed_event("notes/a.md"));

    await flush_effects();

    expect(graph_service.invalidate_cache).not.toHaveBeenCalled();
    expect(note_service.open_note).not.toHaveBeenCalled();
    expect(workspace_reconcile).not.toHaveBeenCalled();

    watcher_port._emit(changed_event("notes/a.md"));

    await flush_effects();

    expect(note_service.open_note).toHaveBeenCalledWith("notes/a.md", false, {
      force_reload: true,
    });

    unmount();
  });

  it("ignores .tmp sibling asset events from atomic self-writes", async () => {
    const vault_store = new VaultStore();
    const editor_store = new EditorStore();
    const tab_store = new TabStore();
    const watcher_port = create_mock_watcher_port();
    const watcher_service = new WatcherService(watcher_port);
    const note_service = {
      open_note: vi.fn(),
      clear_open_note: vi.fn(),
      invalidate_asset_cache: vi.fn(),
    };
    const tab_service = {
      invalidate_cache: vi.fn(),
      mark_conflict: vi.fn(),
      remove_tab: vi.fn(),
      sync_dirty_state: vi.fn(),
    };
    const action_registry = {
      execute: vi.fn(),
    };
    const workspace_reconcile = vi.fn().mockResolvedValue(undefined);
    const graph_service = {
      invalidate_cache: vi.fn().mockResolvedValue(undefined),
    };

    vault_store.set_vault(create_test_vault());

    const unmount = create_watcher_reactor(
      vault_store,
      editor_store,
      tab_store,
      tab_service as never,
      note_service as never,
      watcher_service,
      action_registry as never,
      graph_service as never,
      workspace_reconcile,
    );

    await flush_effects();

    watcher_service.suppress_next("notes/a.md");
    watcher_port._emit(asset_event("notes/a.md.tmp"));
    watcher_port._emit(asset_event("assets/image.png"));

    await flush_effects();

    expect(note_service.invalidate_asset_cache).toHaveBeenCalledTimes(1);
    expect(note_service.invalidate_asset_cache).toHaveBeenCalledWith(
      vault_store.vault?.id,
      "assets/image.png",
    );

    unmount();
  });

  describe("tree refresh suppression", () => {
    it("folder_created resolves to refresh_tree without index sync", () => {
      const decision = resolve_watcher_event_decision(
        folder_created_event("notes/new-folder"),
        VAULT_ID,
        null,
        false,
        NO_BG_TAB,
      );
      expect(decision).toEqual({
        action: "refresh_tree",
        affects_index: false,
      });
    });

    it("folder_removed resolves to refresh_tree without index sync", () => {
      const decision = resolve_watcher_event_decision(
        folder_removed_event("notes/old-folder"),
        VAULT_ID,
        null,
        false,
        NO_BG_TAB,
      );
      expect(decision).toEqual({
        action: "refresh_tree",
        affects_index: false,
      });
    });

    it("note_added resolves to refresh_tree with index sync", () => {
      const decision = resolve_watcher_event_decision(
        added_event("notes/new.md"),
        VAULT_ID,
        null,
        false,
        NO_BG_TAB,
      );
      expect(decision).toEqual({
        action: "refresh_tree",
        affects_index: true,
        index_hint: { changed: "notes/new.md" },
      });
    });

    it("note_removed on open note resolves to clear_and_refresh", () => {
      const decision = resolve_watcher_event_decision(
        removed_event("notes/a.md"),
        VAULT_ID,
        "notes/a.md",
        false,
        NO_BG_TAB,
      );
      expect(decision).toEqual({
        action: "clear_and_refresh",
        note_path: as_note_path("notes/a.md"),
        affects_index: true,
      });
    });

    it("note_removed on background tab resolves to remove_background_tab_and_refresh", () => {
      const decision = resolve_watcher_event_decision(
        removed_event("notes/b.md"),
        VAULT_ID,
        "notes/a.md",
        false,
        bg_tab(false),
      );
      expect(decision).toEqual({
        action: "remove_background_tab_and_refresh",
        note_path: as_note_path("notes/b.md"),
        affects_index: true,
      });
    });
  });

  // The two axes only meet in handle_event, so these drive the whole reactor:
  // an external write has to reach the index whatever the open tab decides to
  // do about it, and a self-write still has to reach nothing.
  describe("external content edits reach the index", () => {
    const DEBOUNCE_MS = 300;

    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    async function settle() {
      await flush_effects();
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
      await flush_effects();
    }

    function path_sync(changed: string[]) {
      return {
        refresh_tree: false,
        sync_index: false,
        sync_index_paths: { changed, removed: [] },
      };
    }

    it("syncs only the changed path when an unopened note is edited on disk", async () => {
      const t = mount_reactor({ is_dirty: false, note_path: "notes/open.md" });
      await flush_effects();

      t.watcher_port._emit(changed_event("notes/other.md", 1_000));
      await settle();

      expect(t.workspace_reconcile).toHaveBeenCalledTimes(1);
      expect(t.workspace_reconcile).toHaveBeenCalledWith(
        path_sync(["notes/other.md"]),
      );
    });

    it("reloads a clean open note and indexes the same write", async () => {
      const t = mount_reactor({ is_dirty: false });
      await flush_effects();

      t.watcher_port._emit(changed_event(t.note_path, 1_000));
      await settle();

      expect(t.note_service.open_note).toHaveBeenCalledWith(
        t.note_path,
        false,
        { force_reload: true },
      );
      expect(t.workspace_reconcile).toHaveBeenCalledWith(
        path_sync([t.note_path]),
      );
    });

    it("marks a conflict on a dirty open note and indexes the same write", async () => {
      const t = mount_reactor({ is_dirty: true });
      await flush_effects();

      t.watcher_port._emit(changed_event(t.note_path, 1_000));
      await settle();

      expect(t.tab_service.mark_conflict).toHaveBeenCalledWith(
        as_note_path(t.note_path),
      );
      expect(t.workspace_reconcile).toHaveBeenCalledWith(
        path_sync([t.note_path]),
      );
    });

    it("coalesces a burst of external edits into one path-scoped sync", async () => {
      const t = mount_reactor({ is_dirty: false, note_path: "notes/open.md" });
      await flush_effects();

      t.watcher_port._emit(changed_event("notes/x.md", 1_000));
      t.watcher_port._emit(changed_event("notes/y.md", 1_000));
      t.watcher_port._emit(changed_event("notes/x.md", 2_000));
      await settle();

      expect(t.workspace_reconcile).toHaveBeenCalledTimes(1);
      expect(t.workspace_reconcile).toHaveBeenCalledWith(
        path_sync(["notes/x.md", "notes/y.md"]),
      );
    });

    it("does not index a save whose event reports the mtime Carbide wrote", async () => {
      const t = mount_reactor({ is_dirty: false });
      await flush_effects();

      t.watcher_service.record_self_write(t.note_path, 9_000);
      t.watcher_port._emit(changed_event(t.note_path, 9_000));
      await settle();

      expect(t.workspace_reconcile).not.toHaveBeenCalled();
    });

    // The pair a save actually delivers: the force-drain in the Rust debouncer
    // emits the held Modify ahead of the structural event, the mtime-less
    // arming is spent by the changed, and the trailing added peeks false. One
    // sync, not two - this measures the interaction rather than assuming it.
    it("counts one index sync for the changed-then-added pair a save delivers", async () => {
      const t = mount_reactor({ is_dirty: false });
      await flush_effects();

      t.watcher_service.suppress_next(t.note_path);
      t.watcher_port._emit(changed_event(t.note_path));
      t.watcher_port._emit(added_event(t.note_path));
      await settle();

      expect(t.note_service.open_note).not.toHaveBeenCalled();
      expect(t.workspace_reconcile).toHaveBeenCalledTimes(1);
      expect(t.workspace_reconcile).toHaveBeenCalledWith({
        refresh_tree: true,
        sync_index: false,
        sync_index_paths: { changed: [t.note_path], removed: [] },
      });
    });

    // The same pair when the changed beats note_service's post-write record,
    // which is the case the arming exists for. It spends the arming, so the
    // trailing added has nothing but its own mtime left to be recognised by -
    // and that mtime is the bytes Carbide just wrote. One save, no reconcile.
    it("costs nothing when the changed spends the arming before the added lands", async () => {
      const t = mount_reactor({ is_dirty: false });
      await flush_effects();

      t.watcher_service.suppress_next(t.note_path);
      t.watcher_port._emit(changed_event(t.note_path));
      t.watcher_service.record_self_write(t.note_path, 9_000);
      t.watcher_port._emit(added_event(t.note_path, 9_000));
      await settle();

      expect(t.note_service.open_note).not.toHaveBeenCalled();
      expect(t.workspace_reconcile).not.toHaveBeenCalled();
    });

    // The bound on the above: recognising a Create by mtime must not swallow
    // one somebody else made to a path Carbide happens to have written.
    it("still reconciles a note recreated on disk with different bytes", async () => {
      const t = mount_reactor({ is_dirty: false });
      await flush_effects();

      t.watcher_service.record_self_write(t.note_path, 9_000);
      t.watcher_port._emit(added_event(t.note_path, 12_000));
      await settle();

      expect(t.workspace_reconcile).toHaveBeenCalledTimes(1);
    });
  });

  describe("graph invalidation", () => {
    it("invalidates only the changed note", () => {
      expect(
        resolve_graph_invalidation(changed_event("notes/a.md"), VAULT_ID),
      ).toEqual({ kind: "note", note_path: "notes/a.md" });
    });

    it("drops the whole index when a note is added or removed", () => {
      expect(
        resolve_graph_invalidation(added_event("notes/a.md"), VAULT_ID),
      ).toEqual({ kind: "all" });
      expect(
        resolve_graph_invalidation(removed_event("notes/a.md"), VAULT_ID),
      ).toEqual({ kind: "all" });
    });

    it("ignores asset and folder events", () => {
      expect(
        resolve_graph_invalidation(asset_event("assets/x.png"), VAULT_ID),
      ).toBeNull();
      expect(
        resolve_graph_invalidation(folder_created_event("notes/x"), VAULT_ID),
      ).toBeNull();
      expect(
        resolve_graph_invalidation(folder_removed_event("notes/x"), VAULT_ID),
      ).toBeNull();
    });

    it("ignores events from another vault", () => {
      expect(
        resolve_graph_invalidation(changed_event("notes/a.md"), "other-vault"),
      ).toBeNull();
    });
  });
});
