/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

vi.mock(
  "$lib/app/context/app_context.svelte",
  async () => import("../helpers/mock_app_context"),
);

import { create_app_stores } from "$lib/app/bootstrap/create_app_stores";
import type { AppContext } from "$lib/app/di/create_app_context";
import type { OpenNoteState } from "$lib/shared/types/editor";
import ContextRailPanel from "$lib/features/links/ui/context_rail_panel.svelte";
import RelatedPanel from "$lib/features/links/ui/related_panel.svelte";
import MetadataPanel from "$lib/features/metadata/ui/metadata_panel.svelte";
import { render_with_app_context } from "../helpers/render_with_app_context";

/* jsdom has no layout engine, so the pane's px width cannot be observed.
   The component's own <style> block is injected instead and asserted through
   getComputedStyle: these are the declarations that decide whether a narrow
   pane truncates its labels or hard-clips its trailing buttons. */
const PANEL_SOURCES = {
  context_rail_panel: "src/lib/features/links/ui/context_rail_panel.svelte",
  related_panel: "src/lib/features/links/ui/related_panel.svelte",
  metadata_panel: "src/lib/features/metadata/ui/metadata_panel.svelte",
} as const;

const NARROW_PANE_WIDTH = "180px";

let injected: HTMLStyleElement[] = [];

function inject_component_css(path: string) {
  const source = readFileSync(path, "utf8");
  const block = /<style>([\s\S]*)<\/style>/.exec(source);
  if (!block) throw new Error(`no <style> block in ${path}`);
  const el = document.createElement("style");
  el.textContent = block[1] ?? "";
  document.head.appendChild(el);
  injected.push(el);
}

function render_narrow<T extends object>(
  component: Parameters<typeof render_with_app_context<T>>[0],
  app_context: Partial<AppContext>,
) {
  const rendered = render_with_app_context(component, { app_context });
  rendered.target.style.width = NARROW_PANE_WIDTH;
  return rendered;
}

function stub_registry() {
  return { execute: () => {} };
}

beforeEach(() => {
  injected = [];
});

afterEach(() => {
  for (const el of injected) el.remove();
  document.body.innerHTML = "";
});

describe("context rail at narrow pane widths", () => {
  it("declares no px floor its percentage-capped pane cannot honour", () => {
    inject_component_css(PANEL_SOURCES.context_rail_panel);
    const stores = create_app_stores();
    const rendered = render_narrow(ContextRailPanel, {
      stores,
    } as unknown as Partial<AppContext>);

    const panel = rendered.target.querySelector<HTMLElement>(
      '[data-testid="context-rail-panel"]',
    );
    expect(panel).not.toBeNull();

    const style = getComputedStyle(panel as HTMLElement);
    expect(style.minWidth).not.toBe("220px");
    expect(style.overflowX).not.toBe("clip");

    rendered.cleanup();
  });

  it("keeps the Related panel's insert-link button pinned beside a truncating title", () => {
    inject_component_css(PANEL_SOURCES.related_panel);
    const stores = create_app_stores();
    stores.editor.open_note = {
      path: "folder/current.md",
      meta: { path: "folder/current.md", title: "Current", name: "current" },
    } as unknown as OpenNoteState;
    stores.notes.notes = [
      {
        path: "folder/sibling.md",
        title: "A sibling note with a title far wider than the pane",
        name: "sibling",
      },
    ] as never;

    const rendered = render_narrow(RelatedPanel, {
      stores,
      action_registry: stub_registry(),
    } as unknown as Partial<AppContext>);

    const button = rendered.target.querySelector<HTMLElement>(
      '[aria-label="Insert link"]',
    );
    expect(button).not.toBeNull();
    expect(getComputedStyle(button as HTMLElement).flexShrink).toBe("0");

    const row = rendered.target.querySelector<HTMLElement>(
      ".RelatedPanel__mention",
    );
    expect(getComputedStyle(row as HTMLElement).flexWrap).not.toBe("wrap");
    expect(row?.querySelector(".truncate")).not.toBeNull();

    rendered.cleanup();
  });

  it("keeps the Metadata panel's edit and delete buttons pinned beside a truncating value", () => {
    inject_component_css(PANEL_SOURCES.metadata_panel);
    const stores = create_app_stores();
    stores.metadata.properties = [
      {
        key: "status",
        value: "a property value far wider than a narrow context rail",
      },
    ] as never;

    const rendered = render_narrow(MetadataPanel, {
      stores,
      action_registry: stub_registry(),
    } as unknown as Partial<AppContext>);

    expect(rendered.target.querySelector('[title="Edit"]')).not.toBeNull();
    expect(rendered.target.querySelector('[title="Delete"]')).not.toBeNull();

    const actions = rendered.target.querySelector<HTMLElement>(
      ".MetadataPanel__prop-actions",
    );
    expect(getComputedStyle(actions as HTMLElement).flexShrink).toBe("0");

    const value = rendered.target.querySelector<HTMLElement>(
      ".MetadataPanel__prop-value",
    );
    const value_style = getComputedStyle(value as HTMLElement);
    expect(value_style.textOverflow).toBe("ellipsis");
    expect(value_style.whiteSpace).toBe("nowrap");

    rendered.cleanup();
  });
});
