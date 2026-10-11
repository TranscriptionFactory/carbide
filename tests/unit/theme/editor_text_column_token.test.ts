import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

describe("editor text column token", () => {
  const editor_css = read("src/styles/editor.css");

  it("defines one 700px text column", () => {
    expect(editor_css).toMatch(/--editor-text-column-width:\s*700px;/);
  });

  it("derives rich and source max widths from the same token", () => {
    expect(editor_css).toMatch(
      /--editor-max-width:\s*min\(\s*calc\(var\(--editor-text-column-width\)/,
    );
    expect(editor_css).toMatch(
      /--source-editor-max-width:\s*var\(--editor-text-column-width\);/,
    );
  });

  it("does not let layout presets override the width", () => {
    expect(read("src/styles/layout_presets.css")).not.toMatch(
      /--editor-max-width:/,
    );
  });

  it("has no ch-based width fallbacks left", () => {
    expect(
      read("src/lib/app/bootstrap/ui/workspace_layout.svelte"),
    ).not.toMatch(/--editor-max-width,\s*72ch/);
    expect(
      read("src/lib/features/editor/ui/source_editor_theme.ts"),
    ).not.toMatch(/48rem/);
  });
});
