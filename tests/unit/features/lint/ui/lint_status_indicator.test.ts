/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import LintStatusIndicator from "$lib/features/lint/ui/lint_status_indicator.svelte";
import {
  flushSync,
  mount,
  unmount,
} from "../../../helpers/svelte_client_runtime";

function render_lint_status_indicator(props?: {
  error_count?: number;
  warning_count?: number;
  is_running?: boolean;
  on_click?: () => void;
  on_format_click?: () => void;
}) {
  const target = document.createElement("div");
  document.body.appendChild(target);

  const app = mount(LintStatusIndicator, {
    target,
    props: {
      error_count: props?.error_count ?? 0,
      warning_count: props?.warning_count ?? 0,
      is_running: props?.is_running ?? false,
      on_click: props?.on_click ?? vi.fn(),
      on_format_click: props?.on_format_click ?? vi.fn(),
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

describe("lint_status_indicator.svelte", () => {
  it("shows the problems button when lint is stopped", () => {
    const on_click = vi.fn();
    const view = render_lint_status_indicator({
      is_running: false,
      on_click,
    });

    const problems_button = get_button_by_title("Lint stopped");
    const format_button = get_button_by_title("Format file");

    expect(problems_button).toBeInstanceOf(HTMLButtonElement);
    expect(format_button).toBeNull();

    problems_button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(on_click).toHaveBeenCalledTimes(1);

    view.cleanup();
  });

  it("shows count label and format button when lint is running", () => {
    const view = render_lint_status_indicator({
      is_running: true,
      error_count: 2,
      warning_count: 1,
    });

    const problems_button = get_button_by_title("2 errors, 1 warning");
    const format_button = get_button_by_title("Format file");

    expect(problems_button).toBeInstanceOf(HTMLButtonElement);
    expect(format_button).toBeInstanceOf(HTMLButtonElement);
    expect(document.body.textContent).toContain("2");
    expect(document.body.textContent).toContain("1");

    view.cleanup();
  });
});
