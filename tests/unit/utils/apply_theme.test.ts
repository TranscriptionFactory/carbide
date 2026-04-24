import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { apply_theme } from "$lib/shared/utils/apply_theme";
import {
  BUILTIN_NORDIC_DARK,
  BUILTIN_NORDIC_LIGHT,
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
    apply_theme(BUILTIN_NORDIC_DARK);
    expect(attributes.get("data-color-scheme")).toBe("dark");
  });

  it("sets data-color-scheme attribute for light theme", () => {
    apply_theme(BUILTIN_NORDIC_LIGHT);
    expect(attributes.get("data-color-scheme")).toBe("light");
  });

  it("sets color-scheme CSS property", () => {
    apply_theme(BUILTIN_NORDIC_DARK);
    expect(store.get("color-scheme")).toBe("dark");
  });

  it("sets accent parametric tokens", () => {
    apply_theme(BUILTIN_NORDIC_DARK);
    expect(store.get("--accent-hue")).toBe("155");
    expect(store.get("--accent-chroma")).toBe("0.11");
  });

  it("sets font family tokens", () => {
    apply_theme(BUILTIN_NORDIC_LIGHT);
    expect(store.get("--font-family-sans")).toContain("Inter");
    expect(store.get("--font-family-mono")).toContain("JetBrains Mono");
  });

  it("sets editor typography tokens", () => {
    apply_theme(BUILTIN_NORDIC_DARK);
    expect(store.get("--editor-font-size")).toBe("1rem");
    expect(store.get("--editor-line-height")).toBe("1.75");
    expect(store.get("--editor-spacing")).toBe("1.5rem");
    expect(store.get("--editor-heading-color")).toBe("var(--foreground)");
  });

  it("cleans up previous theme properties on switch", () => {
    const custom = {
      ...BUILTIN_NORDIC_DARK,
      editor_text_color: "oklch(0.5 0.1 200)",
      token_overrides: { "--custom-cleanup": "yes" },
    };
    apply_theme(custom);
    expect(store.has("--custom-cleanup")).toBe(true);

    apply_theme(BUILTIN_NORDIC_LIGHT);
    expect(store.has("--custom-cleanup")).toBe(false);
  });

  it("applies token_overrides", () => {
    const custom = {
      ...BUILTIN_NORDIC_DARK,
      is_builtin: false,
      id: "custom",
      token_overrides: { "--custom-var": "test-value" },
    };
    apply_theme(custom);
    expect(store.get("--custom-var")).toBe("test-value");
  });

  it("token_overrides beat generated UI tokens", () => {
    const custom = {
      ...BUILTIN_NORDIC_DARK,
      is_builtin: false,
      id: "custom-override",
      token_overrides: { "--background": "oklch(0.99 0 0)" },
    };
    apply_theme(custom);
    expect(store.get("--background")).toBe("oklch(0.99 0 0)");
  });

  it("sets generated UI tokens from surface params", () => {
    apply_theme(BUILTIN_NORDIC_DARK);
    expect(store.get("--background")).toContain("oklch(");
    expect(store.get("--primary")).toContain("oklch(");
    expect(store.get("--border")).toContain("oklch(");
  });

  it("sets heading weight and bold weight tokens", () => {
    apply_theme(BUILTIN_NORDIC_DARK);
    expect(store.get("--editor-heading-weight")).toBe("500");
    expect(store.get("--editor-bold-weight")).toBe("600");
  });

  it("applies bold accent color style", () => {
    const custom = {
      ...BUILTIN_NORDIC_DARK,
      is_builtin: false,
      id: "custom-bold",
      bold_style: "color-accent" as const,
    };
    apply_theme(custom);
    expect(store.get("--editor-bold-color")).toBe("var(--primary)");
  });

  it("does not throw when document is undefined", () => {
    (globalThis as { document: Document | undefined }).document = undefined;
    expect(() => {
      apply_theme(BUILTIN_NORDIC_DARK);
    }).not.toThrow();
    globalThis.document = original_document;
  });

  it("can skip localStorage cache writes for draft previews", () => {
    apply_theme(BUILTIN_NORDIC_DARK, { persist_to_cache: false });
    expect(set_item).not.toHaveBeenCalled();
  });

  it.each(BUILTIN_THEMES.map((t) => [t.id, t]))(
    "applies builtin theme %s without error",
    (_id, theme) => {
      expect(() => apply_theme(theme)).not.toThrow();
      expect(attributes.get("data-color-scheme")).toBe(theme.color_scheme);
      expect(store.size).toBeGreaterThan(0);
    },
  );
});
