import { createRawSnippet } from "svelte";
import { vi } from "vitest";
import { flushSync, mount, unmount } from "./svelte_client_runtime";
import { set_mock_app_context } from "./mock_app_context";
import type { RichClipboardPayload } from "$lib/features/clipboard";
import EditorContextMenu from "$lib/features/editor/ui/editor_context_menu.svelte";

export type EditorContextMenuState = {
  block_selection: Set<number>;
  block_pos: number | null;
  payload: RichClipboardPayload | null;
};

export function render_editor_context_menu(
  initial: Partial<EditorContextMenuState> = {},
) {
  const state: EditorContextMenuState = {
    block_selection: new Set<number>(),
    block_pos: null,
    payload: null,
    ...initial,
  };

  const editor = {
    get_block_selection: vi.fn(() => state.block_selection),
    block_pos_at_coords: vi.fn(() => state.block_pos),
    copy_blocks_payload: vi.fn(() => state.payload),
    delete_block_at: vi.fn(),
    duplicate_block_at: vi.fn(),
    insert_block_at: vi.fn(),
    batch_delete: vi.fn(),
    batch_duplicate: vi.fn(),
    batch_turn_into: vi.fn(),
    clear_block_selection: vi.fn(),
  };
  const clipboard = { copy_rich: vi.fn(async () => {}) };
  const execute = vi.fn(async () => {});

  set_mock_app_context({
    stores: {
      ui: { editor_settings: { markdown_lsp_provider: "none" } },
      markdown_lsp: { status: "idle", transform_actions: [] },
    },
    action_registry: { execute },
    services: { editor, clipboard },
  } as never);

  const target = document.createElement("div");
  document.body.appendChild(target);
  const app = mount(EditorContextMenu, {
    target,
    props: {
      children: createRawSnippet(() => ({ render: () => "<span></span>" })),
    },
  });
  flushSync();

  function right_click(coords: { x: number; y: number } = { x: 120, y: 240 }) {
    const trigger = target.querySelector<HTMLElement>(
      '[data-testid="context-menu-trigger"]',
    );
    if (!trigger) throw new Error("context menu trigger was not rendered");
    trigger.dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true,
        clientX: coords.x,
        clientY: coords.y,
      }),
    );
    flushSync();
  }

  function click_item(label: string) {
    const item = Array.from(
      target.querySelectorAll<HTMLButtonElement>("button"),
    ).find((button) => button.textContent?.trim().startsWith(label));
    if (!item) throw new Error(`context menu item not found: ${label}`);
    item.click();
    flushSync();
  }

  return {
    state,
    editor,
    clipboard,
    execute,
    right_click,
    click_item,
    cleanup: () => {
      void unmount(app);
    },
  };
}
