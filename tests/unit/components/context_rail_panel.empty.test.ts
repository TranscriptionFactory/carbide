/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "$lib/app/context/app_context.svelte",
  async () => import("../helpers/mock_app_context"),
);

import { create_app_stores } from "$lib/app/bootstrap/create_app_stores";
import type { AppContext } from "$lib/app/di/create_app_context";
import type { OpenNoteState } from "$lib/shared/types/editor";
import ContextRailPanel from "$lib/features/links/ui/context_rail_panel.svelte";
import { render_with_app_context } from "../helpers/render_with_app_context";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("context_rail_panel empty state", () => {
  it("shows the shared empty message when no note is open", () => {
    const stores = create_app_stores();
    const { target, cleanup } = render_with_app_context(ContextRailPanel, {
      app_context: { stores } as unknown as Partial<AppContext>,
    });
    const panel = target.querySelector('[data-testid="context-rail-panel"]');
    expect(
      panel?.querySelector('[data-testid="empty-message"]'),
    ).not.toBeNull();
    expect(panel?.textContent).toContain("Open a note to see its context");
    cleanup();
  });

  it("hides the empty message once a note is open", () => {
    const stores = create_app_stores();
    stores.editor.open_note = { path: "a.md" } as unknown as OpenNoteState;
    stores.ui.editor_settings.outline_mode = "docked";
    stores.ui.context_rail_tab = "outline";
    const { target, cleanup } = render_with_app_context(ContextRailPanel, {
      app_context: { stores } as unknown as Partial<AppContext>,
    });
    expect(target.querySelector('[data-testid="empty-message"]')).toBeNull();
    cleanup();
  });
});
