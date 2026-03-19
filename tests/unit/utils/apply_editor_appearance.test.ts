import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { apply_editor_appearance } from "$lib/shared/utils/apply_editor_appearance";
import { DEFAULT_EDITOR_SETTINGS } from "$lib/shared/types/editor_settings";

const original_document = globalThis.document;

describe("apply_editor_appearance", () => {
  let properties: Map<string, string>;

  beforeEach(() => {
    properties = new Map<string, string>();
    globalThis.document = {
      documentElement: {
        style: {
          setProperty: (name: string, value: string) => {
            properties.set(name, value);
          },
          removeProperty: (name: string) => {
            properties.delete(name);
          },
        },
      },
    } as Document;
  });

  afterEach(() => {
    globalThis.document = original_document;
  });

  it("applies the expected appearance variables", () => {
    apply_editor_appearance({
      ...DEFAULT_EDITOR_SETTINGS,
      editor_selection_color: "#112233",
      editor_heading_spacing_density: "compact",
      editor_paragraph_spacing_density: "relaxed",
      editor_list_spacing_density: "compact",
      editor_code_block_padding: "relaxed",
      editor_code_block_radius: "soft",
      editor_blockquote_padding: "compact",
      editor_blockquote_border_width: 4,
      editor_link_underline_style: "wavy",
    });

    expect(properties.get("--editor-selection-bg")).toBe("#112233");
    expect(properties.get("--editor-paragraph-spacing")).toBe(
      "calc(var(--editor-spacing) * 1.2)",
    );
    expect(properties.get("--editor-list-item-spacing")).toBe(
      "calc(var(--editor-spacing) * 0.2)",
    );
    expect(properties.get("--editor-code-block-padding")).toBe(
      "calc(var(--editor-spacing) * 1.25)",
    );
    expect(properties.get("--editor-code-block-radius")).toBe(
      "calc(var(--radius) * 1)",
    );
    expect(properties.get("--editor-blockquote-padding-y")).toBe(
      "calc(var(--editor-spacing) * 0.6)",
    );
    expect(properties.get("--editor-blockquote-border-width")).toBe("4px");
    expect(properties.get("--editor-link-underline-style")).toBe("wavy");
  });

  it("applies heading spacing variables", () => {
    apply_editor_appearance({
      ...DEFAULT_EDITOR_SETTINGS,
      editor_heading_spacing_density: "extra_compact",
    });

    expect(properties.get("--editor-h1-mt")).toBe(
      "calc(var(--editor-spacing) * 0.75)",
    );
    expect(properties.get("--editor-h1-mb")).toBe(
      "calc(var(--editor-spacing) * 0.25)",
    );
    expect(properties.get("--editor-h3-mt")).toBe(
      "calc(var(--editor-spacing) * 0.5)",
    );
  });

  it("applies spacious heading spacing", () => {
    apply_editor_appearance({
      ...DEFAULT_EDITOR_SETTINGS,
      editor_heading_spacing_density: "spacious",
    });

    expect(properties.get("--editor-h1-mt")).toBe(
      "calc(var(--editor-spacing) * 2.75)",
    );
    expect(properties.get("--editor-h2-mb")).toBe(
      "calc(var(--editor-spacing) * 0.9)",
    );
  });

  it("applies extra_compact density for paragraphs and lists", () => {
    apply_editor_appearance({
      ...DEFAULT_EDITOR_SETTINGS,
      editor_paragraph_spacing_density: "extra_compact",
      editor_list_spacing_density: "extra_compact",
    });

    expect(properties.get("--editor-paragraph-spacing")).toBe(
      "calc(var(--editor-spacing) * 0.6)",
    );
    expect(properties.get("--editor-list-spacing")).toBe(
      "calc(var(--editor-spacing) * 0.65)",
    );
    expect(properties.get("--editor-list-item-spacing")).toBe(
      "calc(var(--editor-spacing) * 0.1)",
    );
  });

  it("applies spacious density for paragraphs and blockquotes", () => {
    apply_editor_appearance({
      ...DEFAULT_EDITOR_SETTINGS,
      editor_paragraph_spacing_density: "spacious",
      editor_blockquote_padding: "spacious",
    });

    expect(properties.get("--editor-paragraph-spacing")).toBe(
      "calc(var(--editor-spacing) * 1.5)",
    );
    expect(properties.get("--editor-blockquote-padding-y")).toBe(
      "calc(var(--editor-spacing) * 1.15)",
    );
    expect(properties.get("--editor-blockquote-padding-x")).toBe(
      "calc(var(--editor-spacing) * 1.4)",
    );
  });

  it("clears stale properties when settings return to defaults", () => {
    apply_editor_appearance({
      ...DEFAULT_EDITOR_SETTINGS,
      editor_selection_color: "#112233",
      editor_link_underline_style: "dotted",
    });

    apply_editor_appearance({
      ...DEFAULT_EDITOR_SETTINGS,
    });

    expect(properties.has("--editor-selection-bg")).toBe(false);
    expect(properties.get("--editor-link-underline-style")).toBe("solid");
  });

  it("applies divider style properties for solid", () => {
    apply_editor_appearance({
      ...DEFAULT_EDITOR_SETTINGS,
      editor_divider_style: "solid",
    });

    expect(properties.get("--editor-hr-background")).toBe("none");
    expect(properties.get("--editor-hr-border-top")).toBe(
      "var(--editor-hr-thickness, 1px) solid var(--editor-hr-gradient-mid)",
    );
    expect(properties.get("--editor-hr-opacity")).toBe("0.7");
  });

  it("applies divider style properties for dashed", () => {
    apply_editor_appearance({
      ...DEFAULT_EDITOR_SETTINGS,
      editor_divider_style: "dashed",
    });

    expect(properties.get("--editor-hr-border-top")).toBe(
      "var(--editor-hr-thickness, 1px) dashed var(--editor-hr-gradient-mid)",
    );
  });

  it("applies gradient divider style by default", () => {
    apply_editor_appearance(DEFAULT_EDITOR_SETTINGS);

    expect(properties.get("--editor-hr-background")).toContain(
      "linear-gradient",
    );
    expect(properties.get("--editor-hr-border-top")).toBe("none");
    expect(properties.get("--editor-hr-opacity")).toBe("0.5");
  });

  it("applies divider thickness", () => {
    apply_editor_appearance({
      ...DEFAULT_EDITOR_SETTINGS,
      editor_divider_thickness_px: 3,
    });

    expect(properties.get("--editor-hr-thickness")).toBe("3px");
  });

  it("applies divider spacing", () => {
    apply_editor_appearance({
      ...DEFAULT_EDITOR_SETTINGS,
      editor_divider_spacing: "relaxed",
    });

    expect(properties.get("--editor-hr-spacing")).toBe(
      "calc(var(--editor-spacing) * 3.5)",
    );
  });

  it("applies custom divider color as hr-gradient-mid override", () => {
    apply_editor_appearance({
      ...DEFAULT_EDITOR_SETTINGS,
      editor_divider_color: "#ff0000",
    });

    expect(properties.get("--editor-hr-gradient-mid")).toBe("#ff0000");
  });

  it("does not set hr-gradient-mid when divider color is empty", () => {
    apply_editor_appearance({
      ...DEFAULT_EDITOR_SETTINGS,
      editor_divider_color: "",
    });

    expect(properties.has("--editor-hr-gradient-mid")).toBe(false);
  });

  it("applies table spacing density", () => {
    apply_editor_appearance({
      ...DEFAULT_EDITOR_SETTINGS,
      editor_table_spacing_density: "compact",
    });

    expect(properties.get("--editor-table-cell-padding-y")).toBe(
      "calc(var(--editor-spacing) * 0.5)",
    );
    expect(properties.get("--editor-table-cell-padding-x")).toBe(
      "calc(var(--editor-spacing) * 0.65)",
    );
  });

  it("applies spacious table spacing density", () => {
    apply_editor_appearance({
      ...DEFAULT_EDITOR_SETTINGS,
      editor_table_spacing_density: "spacious",
    });

    expect(properties.get("--editor-table-cell-padding-y")).toBe(
      "calc(var(--editor-spacing) * 1.05)",
    );
    expect(properties.get("--editor-table-cell-padding-x")).toBe(
      "calc(var(--editor-spacing) * 1.25)",
    );
  });

  it("does not throw when document is undefined", () => {
    (globalThis as { document: Document | undefined }).document = undefined;

    expect(() => {
      apply_editor_appearance(DEFAULT_EDITOR_SETTINGS);
    }).not.toThrow();

    globalThis.document = original_document;
  });
});
