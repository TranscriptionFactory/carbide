import { afterEach, describe, expect, it, vi } from "vitest";

const original_window = globalThis.window;
const original_navigator = globalThis.navigator;

function set_browser_env({
  tauri = false,
  user_agent,
}: {
  tauri?: boolean;
  user_agent: string;
}) {
  const window_value = tauri ? { __TAURI_INTERNALS__: {} } : {};
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: window_value,
  });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      userAgent: user_agent,
      userAgentData: undefined,
    },
  });
}

afterEach(() => {
  vi.resetModules();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: original_window,
  });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: original_navigator,
  });
});

describe("detect_platform", () => {
  it("reports desktop tauri separately from mobile tauri", async () => {
    set_browser_env({
      tauri: true,
      user_agent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)",
    });

    const { detect_platform } =
      await import("$lib/shared/utils/detect_platform");

    expect(detect_platform()).toEqual({
      is_tauri: true,
      is_mobile: false,
      is_mobile_tauri: false,
      is_desktop_tauri: true,
    });
  });

  it("detects mobile tauri webviews from the user agent", async () => {
    set_browser_env({
      tauri: true,
      user_agent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
    });

    const { detect_platform } =
      await import("$lib/shared/utils/detect_platform");

    expect(detect_platform()).toEqual({
      is_tauri: true,
      is_mobile: true,
      is_mobile_tauri: true,
      is_desktop_tauri: false,
    });
  });
});
