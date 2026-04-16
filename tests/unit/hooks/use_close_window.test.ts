import { beforeEach, describe, expect, it, vi } from "vitest";

const close = vi.fn();

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: vi.fn(() => ({
    close,
  })),
}));

vi.mock("$lib/shared/utils/detect_platform", () => ({
  is_mobile_tauri: false,
}));

import * as detect_platform from "$lib/shared/utils/detect_platform";
import { make_close_window_handler } from "$lib/hooks/use_close_window.svelte";

describe("make_close_window_handler", () => {
  beforeEach(() => {
    close.mockReset();
    vi.mocked(detect_platform).is_mobile_tauri = false;
  });

  it("closes the window on desktop", () => {
    const preventDefault = vi.fn();
    const handler = make_close_window_handler();

    handler({
      metaKey: true,
      ctrlKey: false,
      key: "w",
      preventDefault,
    } as unknown as KeyboardEvent);

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("skips the close call on mobile", () => {
    vi.mocked(detect_platform).is_mobile_tauri = true;
    const preventDefault = vi.fn();
    const handler = make_close_window_handler();

    handler({
      metaKey: true,
      ctrlKey: false,
      key: "w",
      preventDefault,
    } as unknown as KeyboardEvent);

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(close).not.toHaveBeenCalled();
  });
});
