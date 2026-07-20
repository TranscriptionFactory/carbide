import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";

describe("task list styling", () => {
  test("targets ProseMirror task items by data attributes, not Milkdown classes", () => {
    const css = readFileSync(
      new URL("../../../src/styles/typography.css", import.meta.url),
      "utf-8",
    );
    const normalized = css.replace(/\s+/g, " ");

    expect(normalized).toContain('li[data-item-type="task"]');
    expect(normalized).toContain(
      'li[data-item-type="task"][data-checked="true"]',
    );
    expect(normalized).toContain(
      'li[data-item-type="task"][data-checked="false"]',
    );

    expect(normalized).not.toContain(
      ".milkdown-list-item-block > .list-item > .label-wrapper .label.checked",
    );
    expect(normalized).not.toContain(
      ".milkdown-list-item-block > .list-item > .label-wrapper .label.unchecked",
    );
  });

  test("uses direct child selector for checked strikethrough, not descendant", () => {
    const css = readFileSync(
      new URL("../../../src/styles/typography.css", import.meta.url),
      "utf-8",
    );
    const normalized = css.replace(/\s+/g, " ");

    expect(normalized).toContain(
      'li[data-item-type="task"][data-checked="true"]',
    );
    expect(normalized).not.toContain(
      'li[data-item-type="task"]:has(.label.checked)',
    );
  });
});
