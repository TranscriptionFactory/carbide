import { describe, expect, it, vi } from "vitest";

vi.mock("$lib/shared/utils/detect_platform", () => ({
  is_tauri: false,
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(),
}));

vi.mock("$lib/shared/utils/logger", () => ({
  create_logger: () => ({ info: vi.fn() }),
}));

import { create_menu_action_reactor } from "$lib/reactors/menu_action.reactor.svelte";
import * as detect_platform from "$lib/shared/utils/detect_platform";
import * as tauri_event from "@tauri-apps/api/event";

describe("menu_action.reactor", () => {
  it("returns a no-op cleanup when not in tauri", () => {
    const on_menu_action = vi.fn();
    const unmount = create_menu_action_reactor(on_menu_action);
    expect(typeof unmount).toBe("function");
    unmount();
    expect(on_menu_action).not.toHaveBeenCalled();
  });

  it("invokes on_menu_action with action_id when listen callback fires", async () => {
    vi.mocked(detect_platform).is_tauri = true;

    let captured_callback: ((event: { payload: string }) => void) | null = null;
    const unlisten_fn = vi.fn();

    vi.mocked(tauri_event.listen).mockImplementation((_event, callback) => {
      captured_callback = callback as (event: { payload: string }) => void;
      return Promise.resolve(unlisten_fn);
    });

    const on_menu_action = vi.fn();
    create_menu_action_reactor(on_menu_action);

    await Promise.resolve();
    await Promise.resolve();

    captured_callback!({ payload: "toggle-sidebar" });

    expect(on_menu_action).toHaveBeenCalledOnce();
    expect(on_menu_action).toHaveBeenCalledWith("toggle-sidebar");

    vi.mocked(detect_platform).is_tauri = false;
  });

  it("ignores events after cleanup is called", async () => {
    vi.mocked(detect_platform).is_tauri = true;

    let captured_callback: ((event: { payload: string }) => void) | null = null;
    const unlisten_fn = vi.fn();

    vi.mocked(tauri_event.listen).mockImplementation((_event, callback) => {
      captured_callback = callback as (event: { payload: string }) => void;
      return Promise.resolve(unlisten_fn);
    });

    const on_menu_action = vi.fn();
    const unmount = create_menu_action_reactor(on_menu_action);

    await Promise.resolve();
    await Promise.resolve();

    unmount();
    captured_callback!({ payload: "new-file" });

    expect(on_menu_action).not.toHaveBeenCalled();

    vi.mocked(detect_platform).is_tauri = false;
  });
});
