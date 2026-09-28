/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { create_canvas_autosave_reactor } from "$lib/reactors/canvas_autosave.reactor.svelte";
import { CanvasStore } from "$lib/features/canvas/state/canvas_store.svelte";
import { UIStore } from "$lib/app/orchestration/ui_store.svelte";
import { flush_effects } from "../helpers/tauri_event_mock";

const AUTOSAVE_DELAY_MS = 2_000;

function setup() {
  const canvas_store = new CanvasStore();
  const ui_store = new UIStore();
  ui_store.editor_settings.autosave_enabled = true;
  ui_store.editor_settings.autosave_delay_ms = AUTOSAVE_DELAY_MS;
  canvas_store.init_state("tab1", "a.excalidraw", "excalidraw");
  canvas_store.set_excalidraw_scene("tab1", { elements: [] });

  const canvas_service = { save_canvas: vi.fn().mockResolvedValue(undefined) };
  const unmount = create_canvas_autosave_reactor(
    canvas_store,
    ui_store,
    canvas_service as never,
  );
  return { canvas_store, ui_store, canvas_service, unmount };
}

async function edit(canvas_store: CanvasStore, id: string) {
  canvas_store.set_excalidraw_scene("tab1", { elements: [{ id }] });
  canvas_store.set_dirty("tab1", true);
  await flush_effects();
}

describe("canvas_autosave.reactor", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("saves a dirty drawing after the autosave delay", async () => {
    const { canvas_store, canvas_service, unmount } = setup();

    await edit(canvas_store, "a");
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS - 1);
    expect(canvas_service.save_canvas).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    expect(canvas_service.save_canvas).toHaveBeenCalledWith("tab1");
    unmount();
  });

  it("restarts the delay on each further edit", async () => {
    const { canvas_store, canvas_service, unmount } = setup();

    await edit(canvas_store, "a");
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS - 500);
    await edit(canvas_store, "b");
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS - 500);
    expect(canvas_service.save_canvas).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(500);

    expect(canvas_service.save_canvas).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("does not save clean drawings", async () => {
    const { canvas_service, unmount } = setup();
    await flush_effects();

    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 2);

    expect(canvas_service.save_canvas).not.toHaveBeenCalled();
    unmount();
  });

  it("does not save when autosave is disabled", async () => {
    const { canvas_store, ui_store, canvas_service, unmount } = setup();
    ui_store.editor_settings.autosave_enabled = false;

    await edit(canvas_store, "a");
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 2);

    expect(canvas_service.save_canvas).not.toHaveBeenCalled();
    unmount();
  });

  it("stops retrying once a save has put the tab in an error state", async () => {
    const { canvas_store, canvas_service, unmount } = setup();

    await edit(canvas_store, "a");
    canvas_store.set_status("tab1", "error", "disk full");
    await flush_effects();
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 2);

    expect(canvas_service.save_canvas).not.toHaveBeenCalled();
    unmount();
  });
});
