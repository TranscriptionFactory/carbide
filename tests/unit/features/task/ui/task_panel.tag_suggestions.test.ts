/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "$lib/app/context/app_context.svelte",
  async () => import("../../../helpers/mock_app_context"),
);

import { create_app_stores } from "$lib/app/bootstrap/create_app_stores";
import type { AppContext } from "$lib/app/di/create_app_context";
import TaskPanel from "$lib/features/task/ui/task_panel.svelte";
import { render_with_app_context } from "../../../helpers/render_with_app_context";
import { flushSync } from "../../../helpers/svelte_client_runtime";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("task panel tag suggestions", () => {
  it("offers promoted tags only after `tag includes `", () => {
    const stores = create_app_stores();
    stores.task.queryMode = true;
    stores.tag.set_tags([
      { tag: "project/active", count: 3, promoted: true },
      { tag: "idea", count: 1, promoted: false },
    ]);

    const view = render_with_app_context(TaskPanel, {
      app_context: {
        stores,
        services: {
          task: {
            refreshTasks: vi.fn().mockResolvedValue(undefined),
            queryTasks: vi.fn().mockResolvedValue(undefined),
          },
        },
        action_registry: { execute: vi.fn().mockResolvedValue(undefined) },
      } as unknown as Partial<AppContext>,
    });

    const textarea = view.target.querySelector("textarea");
    if (!textarea) throw new Error("no DSL textarea rendered");
    textarea.value = "tag includes ";
    textarea.selectionStart = textarea.value.length;
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    flushSync();

    const labels = [...view.target.querySelectorAll(".DslSuggest__item")].map(
      (el) => el.textContent?.trim(),
    );
    expect(labels).toEqual(["#project/active"]);

    view.cleanup();
  });
});
