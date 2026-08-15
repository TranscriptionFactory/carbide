/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { create_autosave_reactor } from "$lib/reactors/autosave.reactor.svelte";
import { EditorStore } from "$lib/features/editor/state/editor_store.svelte";
import { UIStore } from "$lib/app/orchestration/ui_store.svelte";
import {
  create_open_note_state,
  create_test_note,
} from "../helpers/test_fixtures";
import { flush_effects } from "../helpers/tauri_event_mock";

const AUTOSAVE_DELAY_MS = 2_000;

function setup() {
  const editor_store = new EditorStore();
  const ui_store = new UIStore();
  ui_store.editor_settings.autosave_enabled = true;
  ui_store.editor_settings.autosave_delay_ms = AUTOSAVE_DELAY_MS;

  const note = create_test_note("notes/a", "A");
  editor_store.set_open_note(create_open_note_state(note));

  const note_service = {
    save_note: vi.fn().mockResolvedValue({ status: "ok" }),
  };
  const tab_service = { mark_conflict: vi.fn() };

  const unmount = create_autosave_reactor(
    editor_store,
    ui_store,
    note_service as never,
    tab_service as never,
  );

  return { editor_store, ui_store, note_service, unmount };
}

async function drain_delay() {
  await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
  await flush_effects();
}

describe("autosave.reactor", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("saves a dirty note after the configured delay", async () => {
    const t = setup();
    await flush_effects();

    t.editor_store.set_dirty(t.editor_store.open_note!.meta.id, true);
    await flush_effects();
    await drain_delay();

    expect(t.note_service.save_note).toHaveBeenCalledTimes(1);
    t.unmount();
  });

  // Persisting streamed AI text the user has not accepted is wrong twice over:
  // rejecting would leave it on disk, and the write moves disk out from under
  // the base revision the accept proposal is checked against.
  it("does not save while an inline AI preview is live", async () => {
    const t = setup();
    await flush_effects();

    t.editor_store.set_ai_preview_active(true);
    t.editor_store.set_dirty(t.editor_store.open_note!.meta.id, true);
    await flush_effects();
    await drain_delay();

    expect(t.note_service.save_note).not.toHaveBeenCalled();
    t.unmount();
  });

  // The case the plan's "cancel the pending autosave on accept" could not
  // reach: the note was already dirty when the run started, so a save was
  // queued before the preview existed. Opening the preview has to cancel it.
  it("cancels a save queued before the preview opened", async () => {
    const t = setup();
    await flush_effects();

    t.editor_store.set_dirty(t.editor_store.open_note!.meta.id, true);
    await flush_effects();
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS / 2);

    t.editor_store.set_ai_preview_active(true);
    await flush_effects();
    await drain_delay();

    expect(t.note_service.save_note).not.toHaveBeenCalled();
    t.unmount();
  });

  it("resumes saving once the preview is gone", async () => {
    const t = setup();
    await flush_effects();

    t.editor_store.set_ai_preview_active(true);
    t.editor_store.set_dirty(t.editor_store.open_note!.meta.id, true);
    await flush_effects();
    await drain_delay();

    t.editor_store.set_ai_preview_active(false);
    await flush_effects();
    await drain_delay();

    expect(t.note_service.save_note).toHaveBeenCalledTimes(1);
    t.unmount();
  });
});
