/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import DslSuggestDropdown from "$lib/components/ui/dsl_suggest_dropdown.svelte";
import type { DslSuggestion } from "$lib/shared/types/dsl_suggestion";
import { flushSync, mount, unmount } from "../helpers/svelte_client_runtime";

function duplicate_label_items(): DslSuggestion[] {
  return [
    {
      label: "Meeting Notes",
      insert: "[[folder-a/Meeting Notes]]",
      detail: "folder-a",
    },
    {
      label: "Meeting Notes",
      insert: "[[folder-b/Meeting Notes]]",
      detail: "folder-b",
    },
  ];
}

function render_dropdown(items: DslSuggestion[], on_select = vi.fn()) {
  const target = document.createElement("div");
  document.body.appendChild(target);
  const app = mount(DslSuggestDropdown, {
    target,
    props: { items, selected_index: 0, on_select },
  });
  flushSync();
  return {
    target,
    on_select,
    cleanup() {
      void unmount(app);
      target.remove();
      flushSync();
    },
  };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("dsl_suggest_dropdown.svelte", () => {
  it("renders both rows for two items with identical labels", () => {
    const { target, cleanup } = render_dropdown(duplicate_label_items());
    const rows = [...target.querySelectorAll("button.DslSuggest__item")];
    expect(rows).toHaveLength(2);
    expect(
      rows.map((row) => row.querySelector(".DslSuggest__label")?.textContent),
    ).toEqual(["Meeting Notes", "Meeting Notes"]);
    expect(
      rows.map((row) => row.querySelector(".DslSuggest__detail")?.textContent),
    ).toEqual(["folder-a", "folder-b"]);
    cleanup();
  });

  it("reports the clicked row index for duplicate-label items", () => {
    const { target, on_select, cleanup } = render_dropdown(
      duplicate_label_items(),
    );
    const rows = target.querySelectorAll("button.DslSuggest__item");
    rows[1]?.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, cancelable: true }),
    );
    flushSync();
    expect(on_select).toHaveBeenCalledTimes(1);
    expect(on_select).toHaveBeenCalledWith(1);
    cleanup();
  });
});
