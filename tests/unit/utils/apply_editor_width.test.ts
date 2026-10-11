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

  it("leaves the stylesheet text column token in charge when readable line length is on", () => {
    apply_editor_width(false);
    apply_editor_width(true);

    expect(properties.has("--editor-max-width")).toBe(false);
    expect(properties.has("--source-editor-max-width")).toBe(false);
  });

  it("fills the pane in rich and source modes when readable line length is off", () => {
    apply_editor_width(false);

    expect(properties.get("--editor-max-width")).toBe("none");
    expect(properties.get("--source-editor-max-width")).toBe("none");
  });

  it("does not throw when document is undefined", () => {
    (globalThis as { document: Document | undefined }).document = undefined;

    expect(() => {
      apply_editor_width(false);
    }).not.toThrow();

    globalThis.document = original_document;
  });
});
