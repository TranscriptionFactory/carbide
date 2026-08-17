/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import BasesTable from "$lib/features/bases/ui/bases_table.svelte";
import { make_base_row } from "../../../helpers/bases_fixtures";
import {
  flushSync,
  mount,
  unmount,
} from "../../../helpers/svelte_client_runtime";

function render(on_sort_toggle?: (property: string) => void) {
  const target = document.createElement("div");
  document.body.appendChild(target);

  const app = mount(BasesTable, {
    target,
    props: {
      rows: [make_base_row("a.md", { status: "done" })],
      on_note_click: vi.fn(),
      active_sort: null,
      ...(on_sort_toggle ? { on_sort_toggle } : {}),
    },
  });
  flushSync();

  return { target, app };
}

function header_classes(target: HTMLElement): string[] {
  return [...target.querySelectorAll("th")].map((th) => th.className);
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("bases table sortable header affordance", () => {
  it("marks headers as clickable when a sort handler is supplied", () => {
    const view = render(vi.fn());

    const sortable = header_classes(view.target).filter((c) =>
      c.includes("cursor-pointer"),
    );
    expect(sortable.length).toBeGreaterThan(0);
    for (const className of sortable) {
      expect(className).toContain("hover:text-foreground");
    }

    void unmount(view.app);
  });

  it("drops the clickable affordance when no sort handler is supplied", () => {
    const view = render(undefined);

    for (const className of header_classes(view.target)) {
      expect(className).not.toContain("cursor-pointer");
      expect(className).not.toContain("hover:text-foreground");
    }

    void unmount(view.app);
  });
});
