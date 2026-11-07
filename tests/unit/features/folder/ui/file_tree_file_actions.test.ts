/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock(
  "$lib/app/context/app_context.svelte",
  async () => import("../../../helpers/mock_app_context"),
);
vi.mock(
  "$lib/components/ui/context-menu",
  async () => import("../../../helpers/ui_stubs/context_menu"),
);
import FileTreeRow from "$lib/features/folder/ui/file_tree_row.svelte";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import type { FlatTreeNode } from "$lib/shared/types/filetree";
import { render_with_app_context } from "../../../helpers/render_with_app_context";

function render_file() {
  const execute = vi.fn().mockResolvedValue(undefined);
  const node: FlatTreeNode = {
    id: "docs/a.pdf",
    path: "docs/a.pdf",
    name: "a.pdf",
    depth: 0,
    is_folder: false,
    is_expanded: false,
    is_loading: false,
    has_error: false,
    error_message: null,
    note: null,
    folder_note: null,
    file_meta: {
      path: "docs/a.pdf",
      name: "a.pdf",
      extension: "pdf",
      size_bytes: 1,
      mtime_ms: 1,
    },
    parent_path: "docs",
    is_load_more: false,
  };
  const view = render_with_app_context(FileTreeRow, {
    app_context: { action_registry: { execute } as never },
    props: {
      node,
      is_selected: false,
      on_toggle_folder: vi.fn(),
      on_select_note: vi.fn(),
      on_select_folder: vi.fn(),
      on_retry_load: vi.fn(),
      on_retry_load_more: vi.fn(),
    },
  });
  return { ...view, execute };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("document tree file menu", () => {
  it("dispatches Save As, Rename, Duplicate and Delete for the clicked file", () => {
    const view = render_file();
    for (const [suffix, action] of [
      ["save-as", ACTION_IDS.file_save_as],
      ["rename", ACTION_IDS.file_request_rename],
      ["duplicate", ACTION_IDS.file_duplicate],
      ["delete", ACTION_IDS.file_request_delete],
    ] as const) {
      const item = view.target.querySelector(
        `[data-testid="file-menu-${suffix}"]`,
      );
      expect(item).toBeInstanceOf(HTMLButtonElement);
      (item as HTMLButtonElement).click();
      expect(view.execute).toHaveBeenCalledWith(action, "docs/a.pdf");
    }
    view.cleanup();
  });
});
