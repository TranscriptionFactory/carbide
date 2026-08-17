import { beforeEach, describe, expect, it, vi } from "vitest";
import { sync_changed_notes } from "$lib/features/assistant/application/note_sync_actions";

type HarnessOptions = {
  open_note?: { path: string; is_dirty: boolean; markdown?: string } | null;
  disk_markdown?: string;
  background_tab_paths?: string[];
};

function create_harness(options: HarnessOptions = {}) {
  const background = new Set(options.background_tab_paths ?? []);
  const stores = {
    editor: {
      open_note: options.open_note
        ? {
            meta: { id: options.open_note.path, path: options.open_note.path },
            is_dirty: options.open_note.is_dirty,
            markdown: options.open_note.markdown ?? "buffer",
          }
        : null,
      mark_clean: vi.fn(),
    },
    tab: {
      invalidate_cache_by_path: vi.fn(),
      find_tab_by_path: vi.fn((path: string) =>
        background.has(path) ? { id: `tab:${path}` } : null,
      ),
      active_tab_id: "tab:active",
    },
    vault: { active_vault_id: "v1" },
  };
  const services = {
    editor: { close_buffer: vi.fn() },
    note: {
      open_note: vi.fn().mockResolvedValue({ status: "ok" }),
      clear_open_note: vi.fn(),
      read_note: vi.fn().mockResolvedValue({
        markdown: options.disk_markdown ?? "disk",
        meta: { mtime_ms: 4_000 },
      }),
    },
    tab: {
      mark_conflict: vi.fn(),
      invalidate_cache: vi.fn(),
      remove_tab: vi.fn(),
    },
  };

  return {
    input: { stores, services } as never,
    stores,
    services,
  };
}

// Both producers hand this function a plain path list and neither guarantees
// uniqueness at the seam: the proposal batch pushes one entry per applied
// write (two proposals against one note repeat it), and the agent runner's
// changed-file list is producer-side deduped today but is not contracted to
// stay that way. A repeat used to cost a second close_buffer +
// open_note(force_reload) round trip on a note that was already current.
describe("sync_changed_notes — a repeated path is one round trip", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reloads the open note once when a proposal batch names it twice", async () => {
    const { input, services, stores } = create_harness({
      open_note: { path: "note.md", is_dirty: false },
    });

    await sync_changed_notes(input, ["note.md", "note.md"]);

    expect(services.editor.close_buffer).toHaveBeenCalledExactlyOnceWith(
      "note.md",
    );
    expect(services.note.open_note).toHaveBeenCalledExactlyOnceWith(
      "note.md",
      false,
      { force_reload: true, cleanup_if_missing: true },
    );
    expect(stores.tab.invalidate_cache_by_path).toHaveBeenCalledOnce();
  });

  it("reloads the open note once when an agent turn names it twice", async () => {
    const { input, services } = create_harness({
      open_note: { path: "notes/a.md", is_dirty: false },
    });

    await sync_changed_notes(input, ["notes/a.md", "notes/b.md", "notes/a.md"]);

    expect(services.editor.close_buffer).toHaveBeenCalledExactlyOnceWith(
      "notes/a.md",
    );
    expect(services.note.open_note).toHaveBeenCalledExactlyOnceWith(
      "notes/a.md",
      false,
      { force_reload: true, cleanup_if_missing: true },
    );
  });

  it("reads disk once for a repeated open note", async () => {
    const { input, services } = create_harness({
      open_note: { path: "note.md", is_dirty: false },
    });

    await sync_changed_notes(input, ["note.md", "note.md", "note.md"]);

    expect(services.note.read_note).toHaveBeenCalledOnce();
  });

  // `new Set` iterates in insertion order, but the reload order is what the
  // user sees when a batch touches several notes, so it is asserted rather
  // than assumed.
  it("keeps first-seen order when a path repeats", async () => {
    const { input, services } = create_harness({
      background_tab_paths: ["b.md", "a.md", "c.md"],
    });

    await sync_changed_notes(input, ["b.md", "a.md", "b.md", "c.md"]);

    expect(services.tab.invalidate_cache.mock.calls.flat()).toEqual([
      "b.md",
      "a.md",
      "c.md",
    ]);
  });

  it("leaves distinct paths untouched", async () => {
    const { input, services } = create_harness({
      background_tab_paths: ["a.md", "b.md"],
    });

    await sync_changed_notes(input, ["a.md", "b.md"]);

    expect(services.tab.invalidate_cache.mock.calls.flat()).toEqual([
      "a.md",
      "b.md",
    ]);
  });
});
