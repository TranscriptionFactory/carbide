import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { apply_editor_width } from "$lib/shared/utils/apply_editor_width";

const original_document = globalThis.document;

describe("apply_editor_width", () => {
  let properties: Map<string, string>;

  beforeEach(() => {
    properties = new Map<string, string>();
    globalThis.document = {
      documentElement: {
        style: {
          setProperty: (name: string, value: string) => {
            properties.set(name, value);
          },
        },
      },
    } as Document;
  });

  afterEach(() => {
    globalThis.document = original_document;
  });

  it("applies the editor width with the viewport cap", () => {
    apply_editor_width(110);

    expect(properties.get("--editor-max-width")).toBe("min(110ch, 90%)");
  });

  it("does not throw when document is undefined", () => {
    (globalThis as { document: Document | undefined }).document = undefined;

    expect(() => {
      apply_editor_width(110);
    }).not.toThrow();

    globalThis.document = original_document;
  });
});
