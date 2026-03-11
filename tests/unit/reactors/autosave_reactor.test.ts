import { describe, expect, it, vi } from "vitest";
import {
  create_autosave_reactor,
  create_split_view_autosave_reactor,
} from "$lib/reactors/autosave.reactor.svelte";

describe("autosave.reactor", () => {
  it("returns a cleanup function", () => {
    const unmount = create_autosave_reactor(
      {
        open_note: {
          is_dirty: false,
          meta: { path: "notes/test.md" },
        },
      } as never,
      {
        editor_settings: {
          autosave_enabled: true,
          autosave_delay_ms: 2000,
        },
      } as never,
      {
        save_note: vi.fn(),
      } as never,
      { mark_conflict: vi.fn() } as never,
    );

    expect(typeof unmount).toBe("function");
    unmount();
  });

  it("returns a cleanup function for split-view autosave", () => {
    const unmount = create_split_view_autosave_reactor(
      () =>
        ({
          open_note: {
            is_dirty: false,
            meta: { path: "notes/secondary.md" },
          },
          mark_clean: vi.fn(),
        }) as never,
      {
        editor_settings: {
          autosave_enabled: true,
          autosave_delay_ms: 2000,
        },
      } as never,
      {
        save_note: vi.fn(),
      } as never,
    );

    expect(typeof unmount).toBe("function");
    unmount();
  });
});
