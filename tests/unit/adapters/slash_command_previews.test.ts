/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import {
  create_commands,
  type SlashCommand,
} from "$lib/features/editor/adapters/slash_command_plugin";
import { build_preview } from "$lib/features/editor/adapters/slash_command_previews";

function find_cmd(id: string): SlashCommand {
  const cmd = create_commands().find((c) => c.id === id);
  if (!cmd) throw new Error(`command "${id}" not found`);
  return cmd;
}

describe("built-in slash command previews", () => {
  it("every built-in command exposes a preview returning an element", () => {
    for (const cmd of create_commands()) {
      expect(cmd.preview, `${cmd.id} has a preview`).toBeTypeOf("function");
      const el = cmd.preview?.();
      expect(el, `${cmd.id} preview is an element`).toBeInstanceOf(HTMLElement);
    }
  });

  it("heading preview renders the matching heading tag", () => {
    const el = find_cmd("h1").preview?.();
    expect(el?.tagName).toBe("H1");
    expect(el?.textContent).toContain("Heading 1");
  });

  it("task list preview renders task items with checkboxes", () => {
    const el = find_cmd("todo").preview?.();
    const tasks = el?.querySelectorAll('li[data-item-type="task"]');
    expect(tasks?.length).toBe(2);
    expect(el?.querySelector('li[data-checked="true"]')).not.toBeNull();
  });

  it("table preview renders a 2x2 table with a header row", () => {
    const el = find_cmd("table").preview?.();
    expect(el?.tagName).toBe("TABLE");
    expect(el?.querySelectorAll("tr").length).toBe(2);
    expect(el?.querySelectorAll("th").length).toBe(2);
  });

  it("note callout preview carries the note modifier class", () => {
    const el = find_cmd("callout-note").preview?.();
    expect(el?.classList.contains("callout-block--note")).toBe(true);
    expect(el?.querySelector(".callout-block__title")?.textContent).toBe(
      "Note",
    );
  });

  it("code preview renders a pre > code block", () => {
    const el = find_cmd("code").preview?.();
    expect(el?.tagName).toBe("PRE");
    expect(el?.querySelector("code")).not.toBeNull();
  });
});

describe("build_preview", () => {
  const base: SlashCommand = {
    id: "x",
    label: "Example",
    description: "An example command",
    icon: "★",
    keywords: [],
    insert: () => undefined,
  };

  it("wraps a real preview in a themed ProseMirror document", () => {
    const cmd: SlashCommand = {
      ...base,
      preview: () => document.createElement("h1"),
    };
    const el = build_preview(cmd, new Map());
    expect(el.classList.contains("ProseMirror")).toBe(true);
    expect(el.classList.contains("SlashMenu__preview-doc")).toBe(true);
    expect(el.querySelector("h1")).not.toBeNull();
  });

  it("falls back to the icon/label card when the builder throws", () => {
    const cmd: SlashCommand = {
      ...base,
      preview: () => {
        throw new Error("boom");
      },
    };
    expect(() => build_preview(cmd, new Map())).not.toThrow();
    const el = build_preview(cmd, new Map());
    expect(el.classList.contains("SlashMenu__fallback")).toBe(true);
    expect(el.textContent).toContain("Example");
  });

  it("renders the fallback card for a plugin command without a preview", () => {
    const cmd: SlashCommand = {
      ...base,
      source: "plugin",
      plugin_name: "My Plugin",
    };
    const el = build_preview(cmd, new Map());
    expect(el.classList.contains("SlashMenu__fallback")).toBe(true);
    expect(el.querySelector(".SlashMenu__fallback-icon")?.textContent).toBe(
      "★",
    );
  });

  it("caches the built preview by command id", () => {
    const cmd: SlashCommand = {
      ...base,
      preview: () => document.createElement("p"),
    };
    const cache = new Map<string, HTMLElement>();
    const first = build_preview(cmd, cache);
    const second = build_preview(cmd, cache);
    expect(first).toBe(second);
  });
});
