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
  live?: boolean;
  on_permission_respond?: (request_id: string, response: unknown) => void;
}) {
  const { props, replace } = create_replaceable_props({
    on_open_path: initial.on_open_path ?? (() => {}),
    ...initial,
  });
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

  it("renders no summary for a call whose arguments never arrived", () => {
    const { target } = render_card({
      event: {
        name: "Terminal",
        input_summary: "{}",
        ok: true,
        result_summary: "done",
      },
    });
    expect(target.textContent).toContain("Terminal");
    expect(target.textContent).not.toContain("{}");
    header_button(target)?.click();
    flushSync();
    expect(target.textContent).not.toContain("{}");
  });

  it("renders the refined input a later update supplied", () => {
    const { target } = render_card({
      event: { name: "bash: ls -la", input_summary: '{"command":"ls -la"}' },
    });
    expect(target.textContent).toContain('{"command":"ls -la"}');
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

  it("renders diff content as an inline diff when expanded", () => {
    const { target } = render_card({
      event: {
        id: "call-1",
        name: "edit_note",
        kind: "edit",
        input_summary: "notes/a.md",
        ok: true,
        content: [
          {
            kind: "diff",
            path: "notes/a.md",
            old_text: "old line",
            new_text: "new line",
          },
        ],
      },
    });
    header_button(target)?.click();
    flushSync();
    expect(target.textContent).toContain("old line");
    expect(target.textContent).toContain("new line");
  });

  it("renders execute text content as a terminal block", () => {
    const { target } = render_card({
      event: {
        id: "call-2",
        name: "bash",
        kind: "execute",
        input_summary: "ls",
        ok: true,
        content: [{ kind: "text", text: "[32mfile.md[0m" }],
        result_summary: "file.md",
      },
    });
    header_button(target)?.click();
    flushSync();
    // ANSI stripped by the terminal block; result_summary not duplicated
    expect(target.textContent).toContain("file.md");
    expect(target.textContent).not.toContain("[32m");
    expect(target.querySelectorAll("pre")).toHaveLength(1);
  });

  it("prefers location chips with line numbers over plain paths", () => {
    const on_open_path = vi.fn();
    const { target } = render_card({
      event: {
        id: "call-3",
        name: "read_note",
        kind: "read",
        input_summary: "notes/a.md",
        paths: ["notes/a.md"],
        locations: [{ path: "notes/a.md", line: 12 }],
        ok: true,
      },
      on_open_path,
    });
    header_button(target)?.click();
    flushSync();
    const chip = [...target.querySelectorAll("button")].find(
      (el) => el.textContent?.trim() === "notes/a.md:12",
    );
    expect(chip).toBeDefined();
    chip?.click();
    expect(on_open_path).toHaveBeenCalledWith("notes/a.md");
  });

  it("auto-expands a live pending permission prompt and fires the response", () => {
    const on_permission_respond = vi.fn();
    const { target } = render_card({
      event: {
        id: "call-1",
        name: "bash",
        kind: "execute",
        input_summary: "ls",
        permission: {
          request_id: "perm-1",
          options: [
            { option_id: "a", label: "Allow", kind: "allow_once" },
            { option_id: "r", label: "Deny", kind: "reject_once" },
          ],
        },
      },
      live: true,
      on_permission_respond,
    });

    // pending prompt overrides the collapsed default
    expect(target.textContent).toContain("Agent wants to run this tool");
    const allow = [...target.querySelectorAll("button")].find(
      (el) => el.textContent?.trim() === "Allow",
    );
    expect(allow).toBeDefined();
    allow?.click();
    expect(on_permission_respond).toHaveBeenCalledWith("perm-1", {
      option_id: "a",
      kind: "allow_once",
    });
  });

  it("renders an orphaned prompt as no longer active on replay", () => {
    const { target } = render_card({
      event: {
        id: "call-1",
        name: "bash",
        kind: "execute",
        input_summary: "ls",
        permission: {
          request_id: "perm-1",
          options: [{ option_id: "a", label: "Allow", kind: "allow_once" }],
        },
      },
      live: false,
    });
    expect(target.textContent).toContain("no longer active");
    expect(target.textContent).not.toContain("Agent wants to run this tool");
  });

  it("marks a denied call and shows the settled line", () => {
    const { target } = render_card({
      event: {
        id: "call-1",
        name: "bash",
        kind: "execute",
        input_summary: "ls",
        ok: false,
        permission: {
          request_id: "perm-1",
          options: [],
          resolved: { outcome: "selected:reject_once", auto: false },
        },
      },
    });
    expect(target.textContent).toContain("denied");
    header_button(target)?.click();
    flushSync();
    expect(target.textContent).toContain("Denied");
  });

  it("shows no check for a completion that mounted settled", () => {
    const { target } = render_card({
      event: { name: "read_note", input_summary: "notes/a.md", ok: true },
    });
    expect(target.querySelector('[aria-label="Succeeded"]')).toBeNull();
    expect(target.querySelector(".animate-spin")).toBeNull();
  });
});
