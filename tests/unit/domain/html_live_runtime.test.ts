/** @vitest-environment jsdom */
import { afterEach, assert, describe, expect, it, vi } from "vitest";
import { build_live_html_runtime } from "$lib/features/document/domain/html_live_runtime";
import { build_live_html_document } from "$lib/features/document/domain/html_live_document";
import alpine_source from "alpinejs/dist/cdn.min.js?raw";
import tailwind_source from "@tailwindcss/browser?raw";

const component = `<div x-data="review"><button @click="tab = 'days'">Days</button><p x-text="tab"></p></div>
<script>document.addEventListener('alpine:init', () => Alpine.data('review', () => ({tab: 'digest'})), {once: true});</script>`;

afterEach(() => {
  const alpine = Reflect.get(window, "Alpine") as
    | {
        stopObservingMutations(): void;
        destroyTree(root: Element): void;
      }
    | undefined;
  alpine?.stopObservingMutations();
  alpine?.destroyTree(document.body);
  document.body.innerHTML = "";
  Reflect.deleteProperty(window, "Alpine");
  vi.restoreAllMocks();
});

describe("detected Live HTML runtimes", () => {
  it.each(["<p>Plain HTML</p>", '<p class="article">Text</p>'])(
    "leaves unmarked content unchanged: %s",
    (content) => {
      expect(build_live_html_runtime(content)).toEqual({ head: "", body: "" });
    },
  );

  it.each([
    '<div x-data="{}"></div>',
    '<script>document.addEventListener("alpine:init", () => {});</script>',
    '<div class="bg-background text-muted-foreground border-border"></div>',
    "<div :class=\"active ? 'bg-selected' : 'bg-card'\"></div>",
  ])("bundles offline runtimes only for marked content: %s", (content) => {
    const { head, body } = build_live_html_runtime(content);
    expect(head).toContain('data-carbide-live-runtime="tailwind"');
    expect(body).toContain('data-carbide-live-runtime="alpine"');
    expect(head).not.toContain("<script src=");
    expect(body).not.toContain("<script src=");
  });

  it("maps semantic colours to supplied theme tokens and document fallbacks", () => {
    const { head } = build_live_html_runtime(component);
    expect(head).toContain(
      "--color-background: var(--background, var(--carbide-bg, #ffffff))",
    );
    expect(head).toContain(
      "--color-primary: var(--primary, var(--carbide-accent, #2563eb))",
    );
    expect(head).toContain("--color-selected: var(--selected,");
    expect(head).toContain(
      "--color-selected-foreground: var(--selected-foreground,",
    );
    expect(head).toContain(
      "--selected: var(--accent, var(--carbide-accent, #2563eb))",
    );
  });

  it.each([
    '<script defer src="https://cdn.example/alpinejs/dist/cdn.min.js"></script>',
    "<script src='/assets/alpine.js'></script>",
    "<script defer src=/assets/alpine.js></script>",
    "<script>window.Alpine = customRuntime;</script>",
    "<script>Alpine.start();</script>",
    '<script type="module">import Alpine from "alpinejs"; Alpine.start();</script>',
  ])(
    "does not inject a second Alpine when the author supplies it: %s",
    (script) => {
      const runtime = build_live_html_runtime(component + script);
      expect(runtime.body).toBe("");
      expect(runtime.head).toContain('data-carbide-live-runtime="tailwind"');
    },
  );

  it("places Alpine after author listeners in fragments and full documents", () => {
    for (const content of [
      component,
      `<html><body>${component}</body></html>`,
      `<html><head></head>${component}</html>`,
    ]) {
      const doc = build_live_html_document({ content, theme_style: "" });
      expect(doc.indexOf('data-carbide-live-runtime="tailwind"')).toBeLessThan(
        doc.indexOf('x-data="review"'),
      );
      expect(doc.indexOf("Alpine.data('review'")).toBeLessThan(
        doc.indexOf('data-carbide-live-runtime="alpine"'),
      );
      expect(doc.indexOf('data-carbide-live-runtime="alpine"')).toBeLessThan(
        doc.indexOf("</html>"),
      );
    }
  });

  it("preserves bundled JavaScript exactly except HTML script-end escaping", () => {
    const { head, body } = build_live_html_runtime(component);
    const parsed = new DOMParser().parseFromString(head + body, "text/html");
    const scripts = parsed.querySelectorAll(
      "script[data-carbide-live-runtime]",
    );
    expect(scripts).toHaveLength(2);
    assert(scripts[0]);
    assert(scripts[1]);
    expect(scripts[0].textContent).toBe(
      tailwind_source.replace(/<\/script/gi, "<\\/script"),
    );
    expect(scripts[1].textContent).toContain(
      alpine_source.replace(/<\/script/gi, "<\\/script"),
    );
    const doc = build_live_html_document({
      content: `<html><head></head><body>${component}</body></html>`,
      theme_style: "",
    });
    const full = new DOMParser().parseFromString(doc, "text/html");
    expect(
      full.querySelector('script[data-carbide-live-runtime="tailwind"]')
        ?.textContent,
    ).toBe(scripts[0].textContent);
  });

  it("does not initialize over an existing Alpine instance", () => {
    const runtime = build_live_html_runtime(component);
    const script = new DOMParser()
      .parseFromString(runtime.body, "text/html")
      .querySelector("script");
    assert(script);
    const existing = {};
    vi.stubGlobal("Alpine", existing);
    try {
      window.eval(script.textContent ?? "");
      expect(Reflect.get(window, "Alpine")).toBe(existing);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it.each(["complete", "loading"] as const)(
    "registers data before Alpine starts and switches tabs when readyState is %s",
    async (ready_state) => {
      vi.spyOn(document, "readyState", "get").mockReturnValue(ready_state);
      document.body.innerHTML = component;
      const author = document.querySelector("script");
      assert(author);
      const runtime = build_live_html_runtime(component);
      const script = new DOMParser()
        .parseFromString(runtime.body, "text/html")
        .querySelector("script");
      assert(script);
      if (ready_state === "complete") window.eval(author.textContent ?? "");
      window.eval(script.textContent ?? "");
      if (ready_state === "loading") {
        expect(Reflect.get(window, "Alpine")).toBeUndefined();
        window.eval(author.textContent ?? "");
        document.dispatchEvent(new Event("DOMContentLoaded"));
      }
      await vi.waitFor(() => {
        expect(document.querySelector("p")?.textContent).toBe("digest");
      });
      const button = document.querySelector("button");
      assert(button);
      button.click();
      await vi.waitFor(() => {
        expect(document.querySelector("p")?.textContent).toBe("days");
      });
    },
  );
});

it("starts author-supplied Alpine exactly once", async () => {
  const content = component + `<script>${alpine_source}</script>`;
  const doc = build_live_html_document({ content, theme_style: "" });
  expect(doc).not.toContain('data-carbide-live-runtime="alpine"');
  const initialized = vi.fn();
  document.addEventListener("alpine:init", initialized, { once: true });
  document.body.innerHTML = new DOMParser().parseFromString(
    doc,
    "text/html",
  ).body.innerHTML;
  for (const script of document.querySelectorAll(
    "script:not([data-carbide-live-runtime])",
  )) {
    window.eval(script.textContent ?? "");
  }
  await vi.waitFor(() => {
    expect(document.querySelector("p")?.textContent).toBe("digest");
  });
  expect(initialized).toHaveBeenCalledTimes(1);
});
