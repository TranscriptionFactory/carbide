/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  flushSync,
  mount,
  unmount,
} from "../../../helpers/svelte_client_runtime";
import { create_replaceable_props } from "../../../helpers/reactive_props.svelte";
import ToolCallCard from "$lib/features/assistant/ui/tool_call_card.svelte";
import type { AssistantToolEvent } from "$lib/features/assistant/types/session";

type MountedApp = ReturnType<typeof mount>;
let mounted: Array<{ app: MountedApp; target: HTMLElement }> = [];

function render_card(initial: {
  event: AssistantToolEvent;
  on_open_path?: (path: string) => void;
}) {
  const { props, replace } = create_replaceable_props(initial);
  const target = document.createElement("div");
  document.body.appendChild(target);
  const app = mount(ToolCallCard, { target, props });
  mounted.push({ app, target });
  flushSync();
  return { target, replace };
}

function header_button(target: HTMLElement): HTMLButtonElement | null {
  return target.querySelector("button[aria-expanded]");
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  for (const { app, target } of mounted) {
    void unmount(app);
    target.remove();
  }
  mounted = [];
  vi.useRealTimers();
});

describe("ToolCallCard", () => {
  it("starts collapsed even with body content", () => {
    const { target } = render_card({
      event: {
        name: "search_notes",
        input_summary: "projects",
        ok: true,
        result_summary: "3 matches",
      },
    });
    expect(target.textContent).toContain("search_notes");
    expect(target.textContent).not.toContain("3 matches");
    expect(header_button(target)?.getAttribute("aria-expanded")).toBe("false");
  });

  it("expands on click to show the result summary and full input", () => {
    const { target } = render_card({
      event: {
        name: "search_notes",
        input_summary: "projects",
        ok: true,
        result_summary: "3 matches",
      },
    });
    header_button(target)?.click();
    flushSync();
    expect(header_button(target)?.getAttribute("aria-expanded")).toBe("true");
    expect(target.textContent).toContain("3 matches");
    expect(target.querySelector("pre")?.textContent).toBe("3 matches");
  });

  it("renders a bodiless event as plain text, not a button", () => {
    const { target } = render_card({
      event: { name: "think", input_summary: "planning" },
    });
    expect(header_button(target)).toBeNull();
    expect(target.querySelectorAll("button")).toHaveLength(0);
  });

  it("opens a path chip through on_open_path", () => {
    const on_open_path = vi.fn();
    const { target } = render_card({
      event: {
        name: "read_note",
        input_summary: "notes/a.md",
        paths: ["notes/a.md"],
        ok: true,
      },
      on_open_path,
    });
    header_button(target)?.click();
    flushSync();
    const chip = [...target.querySelectorAll("button")].find(
      (el) => el.textContent?.trim() === "notes/a.md",
    );
    expect(chip).toBeDefined();
    chip?.click();
    expect(on_open_path).toHaveBeenCalledWith("notes/a.md");
  });

  it("does not auto-expand a failure that mounted already settled", () => {
    const { target } = render_card({
      event: {
        name: "write_note",
        input_summary: "notes/a.md",
        ok: false,
        result_summary: "permission denied",
      },
    });
    expect(header_button(target)?.getAttribute("aria-expanded")).toBe("false");
    expect(target.querySelector('[aria-label="Failed"]')).not.toBeNull();
  });

  it("auto-expands on a live failure transition", () => {
    const { target, replace } = render_card({
      event: {
        name: "write_note",
        input_summary: "notes/a.md",
        result_summary: null,
      },
    });
    expect(target.querySelector('[aria-label="Running"]')).not.toBeNull();

    replace({
      event: {
        name: "write_note",
        input_summary: "notes/a.md",
        ok: false,
        result_summary: "permission denied",
      },
    });
    flushSync();

    expect(header_button(target)?.getAttribute("aria-expanded")).toBe("true");
    expect(target.textContent).toContain("permission denied");
  });

  it("respects a user collapse over the failure auto-expand", () => {
    const { target, replace } = render_card({
      event: {
        name: "write_note",
        input_summary: "notes/a.md",
        result_summary: "will fail",
      },
    });
    // user toggles open then closed while running
    header_button(target)?.click();
    flushSync();
    header_button(target)?.click();
    flushSync();

    replace({
      event: {
        name: "write_note",
        input_summary: "notes/a.md",
        ok: false,
        result_summary: "will fail",
      },
    });
    flushSync();

    expect(header_button(target)?.getAttribute("aria-expanded")).toBe("false");
  });

  it("shows a transient check only on live completion", () => {
    const { target, replace } = render_card({
      event: { name: "read_note", input_summary: "notes/a.md" },
    });
    expect(target.querySelector('[aria-label="Succeeded"]')).toBeNull();

    replace({
      event: { name: "read_note", input_summary: "notes/a.md", ok: true },
    });
    flushSync();
    expect(target.querySelector('[aria-label="Succeeded"]')).not.toBeNull();

    vi.advanceTimersByTime(1500);
    flushSync();
    expect(target.querySelector('[aria-label="Succeeded"]')).toBeNull();
  });

  it("shows no check for a completion that mounted settled", () => {
    const { target } = render_card({
      event: { name: "read_note", input_summary: "notes/a.md", ok: true },
    });
    expect(target.querySelector('[aria-label="Succeeded"]')).toBeNull();
    expect(target.querySelector(".animate-spin")).toBeNull();
  });
});
