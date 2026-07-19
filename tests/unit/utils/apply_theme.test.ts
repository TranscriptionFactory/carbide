import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { apply_theme } from "$lib/shared/utils/apply_theme";
import {
  BUILTIN_CARBIDE_DARK,
  BUILTIN_CARBIDE_LIGHT,
  BUILTIN_THEMES,
} from "$lib/shared/types/theme";

describe("apply_theme", () => {
  const original_document = globalThis.document;
  let store: Map<string, string>;
  let attributes: Map<string, string>;
  let set_item: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    store = new Map<string, string>();
    attributes = new Map<string, string>();
    const root = {
      style: {
        setProperty: (name: string, value: string) => {
          store.set(name, value);
        },
        removeProperty: (name: string) => {
          store.delete(name);
        },
      },
      setAttribute: (name: string, value: string) => {
        attributes.set(name, value);
      },
    };

    const document_stub = { documentElement: root };
    globalThis.document = document_stub as Document;

    globalThis.getComputedStyle = () =>
      ({
        getPropertyValue: () => "",
      }) as unknown as CSSStyleDeclaration;

    set_item = vi.fn();
    const localStorage_stub = {
      getItem: () => null,
      setItem: set_item,
    };
    Object.defineProperty(globalThis, "localStorage", {
      value: localStorage_stub,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    globalThis.document = original_document;
  });

  it("sets data-color-scheme attribute for dark theme", () => {
    apply_theme(BUILTIN_CARBIDE_DARK);
    expect(attributes.get("data-color-scheme")).toBe("dark");
  });

  it("sets data-color-scheme attribute for light theme", () => {
    apply_theme(BUILTIN_CARBIDE_LIGHT);
    expect(attributes.get("data-color-scheme")).toBe("light");
  });

  it("sets color-scheme CSS property", () => {
    apply_theme(BUILTIN_CARBIDE_DARK);
    expect(store.get("color-scheme")).toBe("dark");
  });

  it("sets accent parametric tokens", () => {
    apply_theme(BUILTIN_CARBIDE_DARK);
    expect(store.get("--accent-hue")).toBe("155");
    expect(store.get("--accent-chroma")).toBe("0.11");
  });

  it("sets font family tokens", () => {
    apply_theme(BUILTIN_CARBIDE_LIGHT);
    expect(store.get("--font-family-sans")).toContain("Inter");
    expect(store.get("--font-family-mono")).toContain("JetBrains Mono");
  });

  it("sets editor typography tokens", () => {
    apply_theme(BUILTIN_CARBIDE_DARK);
    expect(store.get("--editor-font-size")).toBe("1rem");
    expect(store.get("--editor-line-height")).toBe("1.75");
    expect(store.get("--editor-spacing")).toBe("1.5rem");
    expect(store.get("--editor-heading-color")).toBe("var(--foreground)");
  });

  it("does not inline generated UI tokens for builtin themes (static CSS owns them)", () => {
    apply_theme(BUILTIN_CARBIDE_DARK);
    expect(store.has("--background")).toBe(false);
    expect(store.has("--primary")).toBe(false);
    expect(store.has("--border")).toBe(false);
  });

  it("cleans up previous theme properties on switch", () => {
    const custom = {
      ...BUILTIN_CARBIDE_DARK,
      is_builtin: false,
      id: "custom-cleanup",
      editor_text_color: "oklch(0.5 0.1 200)",
      token_overrides: { "--custom-cleanup": "yes" },
    };
    apply_theme(custom);
    expect(store.has("--custom-cleanup")).toBe(true);

    apply_theme(BUILTIN_CARBIDE_LIGHT);
    expect(store.has("--custom-cleanup")).toBe(false);
  });

  it("applies token_overrides for user themes", () => {
    const custom = {
      ...BUILTIN_CARBIDE_DARK,
      is_builtin: false,
      id: "custom",
      token_overrides: { "--custom-var": "test-value" },
    };
    apply_theme(custom);
    expect(store.get("--custom-var")).toBe("test-value");
  });

  it("token_overrides beat generated UI tokens", () => {
    const custom = {
      ...BUILTIN_CARBIDE_DARK,
      is_builtin: false,
      id: "custom-override",
      token_overrides: { "--background": "oklch(0.99 0 0)" },
    };
    apply_theme(custom);
    expect(store.get("--background")).toBe("oklch(0.99 0 0)");
  });

  it("sets generated UI tokens from surface params for user themes", () => {
    const custom = {
      ...BUILTIN_CARBIDE_DARK,
      is_builtin: false,
      id: "custom-generated",
      token_overrides: {},
    };
    apply_theme(custom);
    expect(store.get("--background")).toContain("oklch(");
    expect(store.get("--primary")).toContain("oklch(");
    expect(store.get("--border")).toContain("oklch(");
  });

  it("sets heading weight and bold weight tokens", () => {
    apply_theme(BUILTIN_CARBIDE_DARK);
    expect(store.get("--editor-heading-weight")).toBe("500");
    expect(store.get("--editor-bold-weight")).toBe("600");
  });

  it("applies bold accent color style", () => {
    const custom = {
      ...BUILTIN_CARBIDE_DARK,
      is_builtin: false,
      id: "custom-bold",
      bold_style: "color-accent" as const,
    };
    apply_theme(custom);
    expect(store.get("--editor-bold-color")).toBe("var(--primary)");
  });

  it("derives data-theme from css_theme, defaulting to carbide", () => {
    apply_theme(BUILTIN_CARBIDE_DARK);
    expect(attributes.get("data-theme")).toBe("carbide");

    const glass_theme = {
      ...BUILTIN_CARBIDE_DARK,
      css_theme: "glass" as const,
    };
    apply_theme(glass_theme);
    expect(attributes.get("data-theme")).toBe("glass");

    const naked_theme = {
      ...BUILTIN_CARBIDE_DARK,
      css_theme: null,
    };
    apply_theme(naked_theme);
    expect(attributes.get("data-theme")).toBe("carbide");
  });

  it("each kept builtin maps to its own data-theme block", () => {
    for (const theme of BUILTIN_THEMES) {
      apply_theme(theme);
      const expected = theme.id.replace(/-(light|dark)$/, "");
      expect(attributes.get("data-theme")).toBe(expected);
    }
  });

  it("sets data-density attribute from theme.density", () => {
    apply_theme(BUILTIN_CARBIDE_DARK);
    expect(attributes.get("data-density")).toBe("regular");

    const compact_theme = {
      ...BUILTIN_CARBIDE_DARK,
      density: "compact" as const,
    };
    apply_theme(compact_theme);
    expect(attributes.get("data-density")).toBe("compact");

    const airy_theme = {
      ...BUILTIN_CARBIDE_DARK,
      density: "airy" as const,
    };
    apply_theme(airy_theme);
    expect(attributes.get("data-density")).toBe("airy");
  });

  it("writes a v2 FOUC cache with data_theme and density", () => {
    const glass_theme = {
      ...BUILTIN_CARBIDE_DARK,
      css_theme: "glass" as const,
      density: "compact" as const,
    };
    apply_theme(glass_theme);
    expect(set_item).toHaveBeenCalledOnce();
    const cached = JSON.parse(set_item.mock.calls[0]![1] as string);
    expect(cached.v).toBe(2);
    expect(cached.data_theme).toBe("glass");
    expect(cached.density).toBe("compact");
  });

  it("does not throw when document is undefined", () => {
    (globalThis as { document: Document | undefined }).document = undefined;
    expect(() => {
      apply_theme(BUILTIN_CARBIDE_DARK);
    }).not.toThrow();
    globalThis.document = original_document;
  });

  it("can skip localStorage cache writes for draft previews", () => {
    apply_theme(BUILTIN_CARBIDE_DARK, { persist_to_cache: false });
    expect(set_item).not.toHaveBeenCalled();
  });

  it.each(BUILTIN_THEMES.map((t) => [t.id, t]))(
    "applies builtin theme %s without error",
    (_id, theme) => {
      expect(() => {
        apply_theme(theme);
      }).not.toThrow();
      expect(attributes.get("data-color-scheme")).toBe(theme.color_scheme);
      expect(store.size).toBeGreaterThan(0);
    },
  );
});
