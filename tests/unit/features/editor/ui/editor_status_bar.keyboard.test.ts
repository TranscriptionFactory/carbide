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

function render_editor_status_bar(overrides?: {
  zoom_percent?: number;
  on_zoom_reset?: () => void;
  git_conflicts?: number;
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
      has_note: false,
      last_saved_at: null,
      index_progress: { status: "idle", indexed: 0, total: 0, error: null },
      is_reindex_pending: false,
      embedding_progress: {
        status: "idle",
        embedded: 0,
        total: 0,
        error: null,
      },
      vault_name: null,
      git_enabled: false,
      git_branch: "",
      git_is_dirty: false,
      git_pending_files: 0,
      git_sync_status: "idle",
      git_has_remote: false,
      git_is_fetching: false,
      git_ahead: 0,
      git_behind: 0,
      git_conflicts: overrides?.git_conflicts ?? 0,
      on_conflicts_click: vi.fn(),
      is_repairing_links: false,
      link_repair_message: null,
      editor_mode: "visual",
      lint_is_running: false,
      lint_error_count: 0,
      lint_warning_count: 0,
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
      width_mode: "normal",
      on_width_toggle: vi.fn(),
      show_line_numbers: true,
      on_line_numbers_toggle: vi.fn(),
      zoom_percent: overrides?.zoom_percent ?? 100,
      on_zoom_reset: overrides?.on_zoom_reset ?? vi.fn(),
      vim_nav_enabled: false,
      vim_nav_context: "none",
      vim_nav_pending_keys: "",
      on_vim_nav_cheatsheet: vi.fn(),
      html_trust_level: null,
      on_html_trust_click: vi.fn(),
      bottom_panel_open: false,
      bottom_panel_tab: "terminal",
      on_panel_tab_click: vi.fn(),
      color_scheme: "dark",
      on_theme_toggle: overrides?.on_theme_toggle ?? vi.fn(),
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

function get_by_testid(testid: string): HTMLElement | null {
  const element = document.body.querySelector(`[data-testid="${testid}"]`);
  return element instanceof HTMLElement ? element : null;
}

function activate_with_key(element: HTMLElement, key: string) {
  element.focus();
  element.dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
  );
  element.click();
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("editor_status_bar.svelte keyboard", () => {
  it("keeps badge buttons focusable in DOM order", () => {
    const view = render_editor_status_bar({
      zoom_percent: 120,
      git_conflicts: 1,
    });

    const zoom = get_by_testid("status-zoom");
    const conflict = get_by_testid("status-conflict-count");
    const theme = get_by_testid("status-theme-mode");
    if (!zoom || !conflict || !theme) {
      throw new Error("expected all three badges rendered");
    }

    for (const el of [zoom, conflict, theme]) {
      expect(el.tabIndex).toBe(0);
    }
    expect(
      zoom.compareDocumentPosition(conflict) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      conflict.compareDocumentPosition(theme) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    view.cleanup();
  });

  it("fires the theme toggle via Enter and Space activation", () => {
    const on_theme_toggle = vi.fn();
    const view = render_editor_status_bar({ on_theme_toggle });

    const toggle = get_by_testid("status-theme-mode");
    expect(toggle).not.toBeNull();

    activate_with_key(toggle as HTMLElement, "Enter");
    activate_with_key(toggle as HTMLElement, " ");

    expect(on_theme_toggle).toHaveBeenCalledTimes(2);

    view.cleanup();
  });

  it("fires the zoom reset via Enter activation", () => {
    const on_zoom_reset = vi.fn();
    const view = render_editor_status_bar({
      zoom_percent: 150,
      on_zoom_reset,
    });

    const zoom = get_by_testid("status-zoom");
    expect(zoom).not.toBeNull();

    activate_with_key(zoom as HTMLElement, "Enter");

    expect(on_zoom_reset).toHaveBeenCalledTimes(1);

    view.cleanup();
  });
});
