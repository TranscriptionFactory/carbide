/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
vi.mock(
  "$lib/app/context/app_context.svelte",
  async () => import("../helpers/mock_app_context"),
);
vi.mock(
  "$lib/app/bootstrap/ui/app_shell_dialogs.svelte",
  async () => import("../helpers/ui_stubs/dialog_fragment.svelte"),
);
vi.mock(
  "$lib/app/bootstrap/ui/workspace_layout.svelte",
  async () => import("../helpers/ui_stubs/dialog_fragment.svelte"),
);
vi.mock(
  "$lib/features/window/ui/custom_title_bar.svelte",
  async () => import("../helpers/ui_stubs/dialog_fragment.svelte"),
);
import AppShell from "$lib/app/bootstrap/ui/app_shell.svelte";
import { create_app_stores } from "$lib/app/bootstrap/create_app_stores";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import { create_test_vault } from "../helpers/test_fixtures";
import { render_with_app_context } from "../helpers/render_with_app_context";
import { flushSync } from "../helpers/svelte_client_runtime";

describe("file dialog keyboard blocking", () => {
  it("blocks tab shortcuts for Rename/Delete and restores shortcuts after close", () => {
    const stores = create_app_stores();
    stores.vault.set_vault(create_test_vault());
    stores.tab.open_document_tab("a.pdf", "a", "pdf");
    const execute = vi.fn().mockResolvedValue(undefined);
    const view = render_with_app_context(AppShell, {
      app_context: { stores, action_registry: { execute } as never },
    });
    function press_tab_shortcut() {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "1",
          ctrlKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
    }
    execute.mockClear();
    press_tab_shortcut();
    expect(execute).toHaveBeenCalledWith(ACTION_IDS.tab_activate_by_index, 0);
    execute.mockClear();
    for (const mode of ["rename", "delete"] as const) {
      flushSync(() => {
        stores.ui.file_dialog = {
          mode,
          path: "a.pdf",
          new_name: "a.pdf",
          pending: false,
          error: null,
        };
      });
      press_tab_shortcut();
      expect(execute).not.toHaveBeenCalled();
    }
    flushSync(() => {
      stores.ui.file_dialog.mode = null;
    });
    press_tab_shortcut();
    expect(execute).toHaveBeenCalledWith(ACTION_IDS.tab_activate_by_index, 0);
    view.cleanup();
  });
});
