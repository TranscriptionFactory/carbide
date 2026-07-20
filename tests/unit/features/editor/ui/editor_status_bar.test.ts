/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  flushSync,
  mount,
  unmount,
} from "../../../helpers/svelte_client_runtime";

vi.mock(
  "$lib/components/ui/tooltip/index.js",
  async () => import("../../../helpers/ui_stubs/tooltip"),
);

import EditorStatusBar from "$lib/features/editor/ui/editor_status_bar.svelte";

function render_editor_status_bar(props?: {
  lint_is_running?: boolean;
  lint_error_count?: number;
  lint_warning_count?: number;
  has_note?: boolean;
  width_mode?: "normal" | "wide";
  on_width_toggle?: () => void;
  vault_name?: string | null;
  last_saved_at?: number | null;
  zoom_percent?: number;
  on_zoom_reset?: () => void;
  git_conflicts?: number;
  on_conflicts_click?: () => void;
  color_scheme?: "light" | "dark";
  on_theme_toggle?: () => void;
}) {
  const target = document.createElement("div");
  document.body.appendChild(target);

  const app = mount(EditorStatusBar, {
    target,
    props: {
      cursor_info: null,
      word_count: 0,
      line_count: 0,
      has_note: props?.has_note ?? false,
      last_saved_at: props?.last_saved_at ?? null,
      index_progress: { status: "idle", indexed: 0, total: 0, error: null },
      is_reindex_pending: false,
      embedding_progress: {
        status: "idle",
        embedded: 0,
        total: 0,
        error: null,
      },
      vault_name: props?.vault_name ?? null,
      git_enabled: false,
      git_branch: "",
      git_is_dirty: false,
      git_pending_files: 0,
      git_sync_status: "idle",
      git_has_remote: false,
      git_is_fetching: false,
      git_ahead: 0,
      git_behind: 0,
      git_conflicts: props?.git_conflicts ?? 0,
      on_conflicts_click: props?.on_conflicts_click ?? vi.fn(),
      is_repairing_links: false,
      link_repair_message: null,
      editor_mode: "visual",
      lint_is_running: props?.lint_is_running ?? false,
      lint_error_count: props?.lint_error_count ?? 0,
      lint_warning_count: props?.lint_warning_count ?? 0,
      on_lint_click: vi.fn(),
      on_lint_format_click: vi.fn(),
      status_bar_items: [],
      on_vault_click: vi.fn(),
      on_info_click: vi.fn(),
      on_git_click: vi.fn(),
      on_git_fetch: vi.fn(),
      on_git_push: vi.fn(),
      on_git_pull: vi.fn(),
      on_git_sync: vi.fn(),
      on_git_add_remote: vi.fn(),
      on_sync_click: vi.fn(),
      on_mode_toggle: vi.fn(),
      split_view: false,
      on_split_toggle: vi.fn(),
      width_mode: props?.width_mode ?? "normal",
      on_width_toggle: props?.on_width_toggle ?? vi.fn(),
      show_line_numbers: true,
      on_line_numbers_toggle: vi.fn(),
      zoom_percent: props?.zoom_percent ?? 100,
      on_zoom_reset: props?.on_zoom_reset ?? vi.fn(),
      vim_nav_enabled: false,
      vim_nav_context: "none",
      vim_nav_pending_keys: "",
      on_vim_nav_cheatsheet: vi.fn(),
      html_trust_level: null,
      on_html_trust_click: vi.fn(),
      bottom_panel_open: false,
      bottom_panel_tab: "terminal",
      on_panel_tab_click: vi.fn(),
      color_scheme: props?.color_scheme ?? "dark",
      on_theme_toggle: props?.on_theme_toggle ?? vi.fn(),
    },
  });

  flushSync();

  return {
    cleanup() {
      unmount(app);
      target.remove();
      flushSync();
    },
  };
}

function get_button_by_title(title: string): HTMLButtonElement | null {
  const element = document.body.querySelector(`button[title="${title}"]`);
  return element instanceof HTMLButtonElement ? element : null;
}

function get_button_by_aria_label(label: string): HTMLButtonElement | null {
  const element = document.body.querySelector(`button[aria-label="${label}"]`);
  return element instanceof HTMLButtonElement ? element : null;
}

function get_by_testid(testid: string): HTMLElement | null {
  const element = document.body.querySelector(`[data-testid="${testid}"]`);
  return element instanceof HTMLElement ? element : null;
}

function set_window_width(width: number) {
  Object.defineProperty(window, "innerWidth", {
    value: width,
    configurable: true,
    writable: true,
  });
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("editor_status_bar.svelte", () => {
  it("shows problems indicator even when lint is not running", () => {
    const view = render_editor_status_bar({
      lint_is_running: false,
    });

    const problems_button = get_button_by_title("Lint stopped");
    const format_button = get_button_by_title("Format file");

    expect(problems_button).toBeInstanceOf(HTMLButtonElement);
    expect(format_button).toBeNull();

    view.cleanup();
  });

  it("shows lint issue counts when lint is running", () => {
    const view = render_editor_status_bar({
      lint_is_running: true,
      lint_error_count: 1,
      lint_warning_count: 2,
    });

    const problems_button = get_button_by_title("1 error, 2 warnings");
    const format_button = get_button_by_title("Format file");

    expect(problems_button).toBeInstanceOf(HTMLButtonElement);
    expect(format_button).toBeInstanceOf(HTMLButtonElement);

    view.cleanup();
  });

  it("reflects wide width mode on the width toggle", () => {
    const view = render_editor_status_bar({
      has_note: true,
      width_mode: "wide",
    });

    const width_button = get_button_by_aria_label("Toggle note width");

    expect(width_button).toBeInstanceOf(HTMLButtonElement);
    expect(
      width_button?.classList.contains("StatusBar__mode-toggle--active"),
    ).toBe(true);
    expect(document.body.textContent).toContain(
      "Note width: wide — switch to normal",
    );

    view.cleanup();
  });

  it("reflects normal width mode on the width toggle", () => {
    const view = render_editor_status_bar({
      has_note: true,
      width_mode: "normal",
    });

    const width_button = get_button_by_aria_label("Toggle note width");

    expect(width_button).toBeInstanceOf(HTMLButtonElement);
    expect(
      width_button?.classList.contains("StatusBar__mode-toggle--active"),
    ).toBe(false);
    expect(document.body.textContent).toContain(
      "Note width: normal — switch to wide",
    );

    view.cleanup();
  });

  it("invokes on_width_toggle when the width toggle is clicked", () => {
    const on_width_toggle = vi.fn();
    const view = render_editor_status_bar({ has_note: true, on_width_toggle });

    const width_button = get_button_by_aria_label("Toggle note width");
    width_button?.click();

    expect(on_width_toggle).toHaveBeenCalledTimes(1);

    view.cleanup();
  });

  it("hides the conflict badge when there are no conflicts", () => {
    const view = render_editor_status_bar({ git_conflicts: 0 });

    expect(get_by_testid("status-conflict-count")).toBeNull();

    view.cleanup();
  });

  it("shows the conflict count and dispatches on_conflicts_click", () => {
    const on_conflicts_click = vi.fn();
    const view = render_editor_status_bar({
      git_conflicts: 3,
      on_conflicts_click,
    });

    const badge = get_by_testid("status-conflict-count");
    expect(badge?.textContent?.replace(/\s+/g, " ").trim()).toContain(
      "3 conflicts",
    );

    badge?.click();
    expect(on_conflicts_click).toHaveBeenCalledTimes(1);

    view.cleanup();
  });

  it("offers the opposite scheme on the theme toggle", () => {
    const dark_view = render_editor_status_bar({ color_scheme: "dark" });
    expect(get_by_testid("status-theme-mode")?.getAttribute("aria-label")).toBe(
      "Switch to light theme",
    );
    dark_view.cleanup();

    const light_view = render_editor_status_bar({ color_scheme: "light" });
    expect(get_by_testid("status-theme-mode")?.getAttribute("aria-label")).toBe(
      "Switch to dark theme",
    );
    light_view.cleanup();
  });

  it("dispatches on_theme_toggle when the theme toggle is clicked", () => {
    const on_theme_toggle = vi.fn();
    const view = render_editor_status_bar({ on_theme_toggle });

    get_by_testid("status-theme-mode")?.click();
    expect(on_theme_toggle).toHaveBeenCalledTimes(1);

    view.cleanup();
  });

  it("hides the zoom badge at 100%", () => {
    const view = render_editor_status_bar({ zoom_percent: 100 });

    expect(get_by_testid("status-zoom")).toBeNull();

    view.cleanup();
  });

  it("shows the zoom badge off 100% and resets on click", () => {
    const on_zoom_reset = vi.fn();
    const view = render_editor_status_bar({
      zoom_percent: 120,
      on_zoom_reset,
    });

    const zoom = get_by_testid("status-zoom");
    expect(zoom?.textContent).toContain("120%");

    zoom?.click();
    expect(on_zoom_reset).toHaveBeenCalledTimes(1);

    view.cleanup();
  });

  it("enters compact mode at or below 1000px window width", () => {
    set_window_width(800);
    const view = render_editor_status_bar({ vault_name: "MyVault" });

    expect(
      get_by_testid("status-bar")?.classList.contains("StatusBar--compact"),
    ).toBe(true);

    set_window_width(1400);
    window.dispatchEvent(new Event("resize"));
    flushSync();

    expect(
      get_by_testid("status-bar")?.classList.contains("StatusBar--compact"),
    ).toBe(false);

    view.cleanup();
  });

  it("refreshes the saved label on a 30s ticker", () => {
    vi.useFakeTimers();
    const now = Date.now();
    const view = render_editor_status_bar({ last_saved_at: now - 45_000 });

    expect(document.body.textContent).toContain("Saved just now");

    vi.advanceTimersByTime(29_999);
    flushSync();
    expect(document.body.textContent).toContain("Saved just now");

    vi.advanceTimersByTime(1);
    flushSync();
    expect(document.body.textContent).toContain("Saved 1m ago");

    view.cleanup();
    vi.useRealTimers();
  });
});
