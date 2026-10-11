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
import TagPanel from "$lib/features/tags/ui/tag_panel.svelte";
import { render_with_app_context } from "../helpers/render_with_app_context";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("tag_panel note rows", () => {
  it("keeps every note row at natural height so a long list scrolls", () => {
    const stores = create_app_stores();
    stores.tag.selected_tag = "project";
    stores.tag.notes_for_tag = Array.from(
      { length: 50 },
      (_, i) => `notes/note_${String(i)}.md`,
    );
    const action_registry = { execute: () => Promise.resolve() };
    const { target, cleanup } = render_with_app_context(TagPanel, {
      app_context: {
        stores,
        action_registry,
      } as unknown as Partial<AppContext>,
    });

    const rows = Array.from(
      target.querySelectorAll<HTMLButtonElement>("button.truncate"),
    );
    expect(rows).toHaveLength(50);
    for (const row of rows) {
      expect(row.classList.contains("shrink-0")).toBe(true);
    }
    cleanup();
  });
});
