import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { apply_affordances } from "$lib/shared/utils/apply_affordances";

describe("apply_affordances", () => {
  const original_document = globalThis.document;
  let attributes: Map<string, string>;
  let css_properties: Map<string, string>;

  beforeEach(() => {
    attributes = new Map<string, string>();
    css_properties = new Map<string, string>();

    const root = {
      setAttribute: (name: string, value: string) => {
        attributes.set(name, value);
      },
    };

    const fake_computed_style = new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === "getPropertyValue") {
            return (name: string) => css_properties.get(name) ?? "";
          }
          return undefined;
        },
      },
    );

    const document_stub = { documentElement: root };
    globalThis.document = document_stub as Document;
    globalThis.getComputedStyle = () =>
      fake_computed_style as CSSStyleDeclaration;
  });

  afterEach(() => {
    globalThis.document = original_document;
  });

  it("strips double quotes from CSS string values", () => {
    css_properties.set("--statusbar-shape", '"segments"');
    css_properties.set("--tab-active-indicator", '"border"');
    css_properties.set("--sidebar-active-shape", '"invert"');

    apply_affordances();

    expect(attributes.get("data-statusbar-shape")).toBe("segments");
    expect(attributes.get("data-tab-indicator")).toBe("border");
    expect(attributes.get("data-sidebar-active")).toBe("invert");
  });

  it("strips single quotes from CSS string values", () => {
    css_properties.set("--statusbar-shape", "'transparent'");

    apply_affordances();

    expect(attributes.get("data-statusbar-shape")).toBe("transparent");
  });

  it("falls back to defaults when property is empty", () => {
    apply_affordances();

    expect(attributes.get("data-statusbar-shape")).toBe("bar");
    expect(attributes.get("data-tab-indicator")).toBe("underline");
    expect(attributes.get("data-sidebar-active")).toBe("ribbon");
    expect(attributes.get("data-chrome-mode")).toBe("normal");
    expect(attributes.get("data-activitybar-mode")).toBe("rail");
    expect(attributes.get("data-tabbar-mode")).toBe("bar");
  });

  it("sets all affordance attributes", () => {
    css_properties.set("--statusbar-shape", '"bar"');
    css_properties.set("--tab-active-indicator", '"fill"');
    css_properties.set("--sidebar-active-shape", '"weight"');
    css_properties.set("--chrome-mode", '"edge-reveal"');
    css_properties.set("--activitybar-mode", '"floating-dock"');
    css_properties.set("--tabbar-mode", '"floating-pill"');

    apply_affordances();

    expect(attributes.size).toBe(6);
    expect(attributes.get("data-statusbar-shape")).toBe("bar");
    expect(attributes.get("data-tab-indicator")).toBe("fill");
    expect(attributes.get("data-sidebar-active")).toBe("weight");
    expect(attributes.get("data-chrome-mode")).toBe("edge-reveal");
    expect(attributes.get("data-activitybar-mode")).toBe("floating-dock");
    expect(attributes.get("data-tabbar-mode")).toBe("floating-pill");
  });

  it("is a no-op when document is undefined", () => {
    (globalThis as { document: Document | undefined }).document = undefined;
    expect(() => apply_affordances()).not.toThrow();
    globalThis.document = original_document;
  });
});
