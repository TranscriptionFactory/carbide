/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "../helpers/svelte_client_runtime";
import DslSuggestDropdown from "$lib/components/ui/dsl_suggest_dropdown.svelte";
import type { DslSuggestion } from "$lib/shared/types/dsl_suggestion";

type Mounted = { app: ReturnType<typeof mount>; target: HTMLElement };
let mounted: Mounted[] = [];

function render(items: DslSuggestion[]) {
  const target = document.createElement("div");
  document.body.appendChild(target);
  const app = mount(DslSuggestDropdown, {
    target,
    props: { items, selected_index: 0, on_select: vi.fn() },
  });
  mounted.push({ app, target });
  flushSync();
  return target;
}

afterEach(() => {
  for (const { app, target } of mounted) {
    void unmount(app);
    target.remove();
  }
  mounted = [];
});

describe("DslSuggestDropdown", () => {
  it("renders items sharing a label without a keyed-each collision", () => {
    const items: DslSuggestion[] = [
      { label: "Meeting Notes", insert: "[[a]] ", detail: "a.md" },
      { label: "Meeting Notes", insert: "[[b]] ", detail: "b.md" },
    ];

    const target = render(items);

    expect(target.querySelectorAll("button")).toHaveLength(2);
    const details = [...target.querySelectorAll(".DslSuggest__detail")].map(
      (el) => el.textContent,
    );
    expect(details).toEqual(["a.md", "b.md"]);
  });
});
