/**
 * @vitest-environment jsdom
 */
//
// The jsdom pragma plus flushSync() is load-bearing: without both, the Svelte
// `$effect` body never runs and every assertion below passes vacuously. The
// first case is the positive control that catches a missing effect.
import { afterEach, describe, expect, it, vi } from "vitest";
import { flushSync } from "svelte";
import { create_visual_editor_diagnostics_reactor } from "$lib/reactors/visual_editor_diagnostics.reactor.svelte";
import { DiagnosticsStore } from "$lib/features/diagnostics/state/diagnostics_store.svelte";
import { EditorStore } from "$lib/features/editor/state/editor_store.svelte";
import { UIStore } from "$lib/app/orchestration/ui_store.svelte";
import type { EditorService } from "$lib/features/editor";
import type { Diagnostic } from "$lib/features/diagnostics";
import { as_markdown_text, as_note_path } from "$lib/shared/types/ids";

const NOTE_A = "notes/a.md";
const NOTE_B = "notes/b.md";

function diagnostic(message: string): Diagnostic {
  return {
    source: "markdown_lsp",
    line: 0,
    column: 0,
    end_line: 0,
    end_column: 4,
    severity: "warning",
    message,
    rule_id: null,
    fixable: false,
  };
}

function open_note(editor_store: EditorStore, path: string): void {
  editor_store.set_open_note({
    meta: {
      id: as_note_path(path),
      path: as_note_path(path),
      name: path.split("/").pop() ?? path,
      title: path,
      blurb: "",
      mtime_ms: 0,
      ctime_ms: 0,
      size_bytes: 0,
      file_type: null,
    },
    markdown: as_markdown_text("# Test\n"),
    buffer_id: path,
    is_dirty: false,
  });
}

let dispose: (() => void) | null = null;

afterEach(() => {
  dispose?.();
  dispose = null;
});

function mount() {
  const diagnostics_store = new DiagnosticsStore();
  const editor_store = new EditorStore();
  const ui_store = new UIStore();
  const update = vi.fn();

  dispose = create_visual_editor_diagnostics_reactor(
    diagnostics_store,
    { update_visual_editor_diagnostics: update } as unknown as EditorService,
    ui_store,
    editor_store,
  );
  flushSync();

  return { diagnostics_store, editor_store, ui_store, update };
}

describe("visual_editor_diagnostics.reactor", () => {
  it("publishes the active note's diagnostics", () => {
    const { diagnostics_store, editor_store, update } = mount();
    open_note(editor_store, NOTE_A);
    diagnostics_store.set_active_file(NOTE_A);
    diagnostics_store.push("markdown_lsp", NOTE_A, [diagnostic("first")]);
    flushSync();

    expect(update).toHaveBeenLastCalledWith([diagnostic("first")]);
  });

  it("waits out a document that is ahead of its serialized snapshot", () => {
    const { diagnostics_store, editor_store, update } = mount();
    open_note(editor_store, NOTE_A);
    diagnostics_store.set_active_file(NOTE_A);

    editor_store.set_doc_ahead_of_snapshot(true);
    flushSync();
    update.mockClear();

    diagnostics_store.push("markdown_lsp", NOTE_A, [diagnostic("stale")]);
    flushSync();
    expect(update).not.toHaveBeenCalled();
  });

  it("re-applies the latest snapshot once serialization catches up", () => {
    const { diagnostics_store, editor_store, update } = mount();
    open_note(editor_store, NOTE_A);
    diagnostics_store.set_active_file(NOTE_A);

    editor_store.set_doc_ahead_of_snapshot(true);
    flushSync();
    diagnostics_store.push("markdown_lsp", NOTE_A, [diagnostic("older")]);
    flushSync();
    update.mockClear();
    diagnostics_store.push("markdown_lsp", NOTE_A, [diagnostic("latest")]);
    flushSync();
    expect(update).not.toHaveBeenCalled();

    editor_store.set_doc_ahead_of_snapshot(false);
    flushSync();

    expect(update).toHaveBeenLastCalledWith([diagnostic("latest")]);
  });

  it("clears immediately when the display setting is off, even while dirty", () => {
    const { diagnostics_store, editor_store, ui_store, update } = mount();
    open_note(editor_store, NOTE_A);
    diagnostics_store.set_active_file(NOTE_A);
    diagnostics_store.push("markdown_lsp", NOTE_A, [diagnostic("shown")]);
    flushSync();
    expect(update).toHaveBeenLastCalledWith([diagnostic("shown")]);

    ui_store.editor_settings.diagnostics_display_enabled = false;
    editor_store.set_doc_ahead_of_snapshot(true);
    flushSync();

    expect(update).toHaveBeenLastCalledWith([]);
  });

  it("never applies a snapshot from a note that is not open", () => {
    const { diagnostics_store, editor_store, update } = mount();
    open_note(editor_store, NOTE_B);
    diagnostics_store.set_active_file(NOTE_B);
    flushSync();
    update.mockClear();

    diagnostics_store.push("markdown_lsp", NOTE_A, [diagnostic("other note")]);
    flushSync();

    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenLastCalledWith([]);
  });
});
