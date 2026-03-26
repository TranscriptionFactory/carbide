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
      show_line_numbers: true,
      on_line_numbers_toggle: vi.fn(),
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
});
