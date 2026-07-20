/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import FindInFileBar from "$lib/features/search/ui/find_in_file_bar.svelte";
import { flushSync, mount, unmount } from "../helpers/svelte_client_runtime";

function render_find_bar(
  overrides: Partial<{
    open: boolean;
    query: string;
    match_count: number;
    selected_match_index: number;
    show_replace: boolean;
    replace_text: string;
    case_sensitive: boolean;
    whole_word: boolean;
  }> = {},
) {
  const callbacks = {
    on_query_change: vi.fn(),
    on_next: vi.fn(),
    on_prev: vi.fn(),
    on_close: vi.fn(),
    on_toggle_replace: vi.fn(),
    on_toggle_case: vi.fn(),
    on_toggle_whole_word: vi.fn(),
    on_replace_text_change: vi.fn(),
    on_replace_one: vi.fn(),
    on_replace_all: vi.fn(),
  };
  const props = {
    open: true,
    query: "needle",
    match_count: 7,
    selected_match_index: 1,
    show_replace: false,
    replace_text: "",
    case_sensitive: false,
    whole_word: false,
    ...callbacks,
    ...overrides,
  };
  const target = document.createElement("div");
  document.body.appendChild(target);
  const app = mount(FindInFileBar, { target, props });
  flushSync();
  return {
    target,
    callbacks,
    cleanup() {
      unmount(app);
      target.remove();
      flushSync();
    },
  };
}

function key(target: Element, testid: string, init: KeyboardEventInit) {
  const el = target.querySelector<HTMLElement>(`[data-testid="${testid}"]`);
  expect(el).not.toBeNull();
  el!.dispatchEvent(
    new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }),
  );
  flushSync();
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("find_in_file_bar keyboard", () => {
  it("advances on Enter in the find input", () => {
    const { target, callbacks, cleanup } = render_find_bar();
    key(target, "find-input", { key: "Enter" });
    expect(callbacks.on_next).toHaveBeenCalledOnce();
    expect(callbacks.on_prev).not.toHaveBeenCalled();
    cleanup();
  });

  it("goes back on Shift+Enter in the find input", () => {
    const { target, callbacks, cleanup } = render_find_bar();
    key(target, "find-input", { key: "Enter", shiftKey: true });
    expect(callbacks.on_prev).toHaveBeenCalledOnce();
    expect(callbacks.on_next).not.toHaveBeenCalled();
    cleanup();
  });

  it("closes on Escape in the find input", () => {
    const { target, callbacks, cleanup } = render_find_bar();
    key(target, "find-input", { key: "Escape" });
    expect(callbacks.on_close).toHaveBeenCalledOnce();
    cleanup();
  });

  it("replaces one on Enter in the replace input", () => {
    const { target, callbacks, cleanup } = render_find_bar({
      show_replace: true,
    });
    key(target, "replace-input", { key: "Enter" });
    expect(callbacks.on_replace_one).toHaveBeenCalledOnce();
    cleanup();
  });

  it("disables navigation and replace actions with zero matches", () => {
    const { target, cleanup } = render_find_bar({
      match_count: 0,
      show_replace: true,
    });
    for (const testid of [
      "find-prev",
      "find-next",
      "replace-one",
      "replace-all",
    ]) {
      const el = target.querySelector<HTMLButtonElement>(
        `[data-testid="${testid}"]`,
      );
      expect(el?.disabled, testid).toBe(true);
    }
    cleanup();
  });

  it("renders the match counter and the no-results state", () => {
    const counted = render_find_bar({
      match_count: 7,
      selected_match_index: 1,
    });
    expect(
      counted.target.querySelector('[data-testid="find-count"]')?.textContent,
    ).toBe("2 of 7");
    counted.cleanup();

    const empty = render_find_bar({ match_count: 0, query: "needle" });
    expect(
      empty.target.querySelector('[data-testid="find-count"]')?.textContent,
    ).toBe("No results");
    empty.cleanup();
  });
});
