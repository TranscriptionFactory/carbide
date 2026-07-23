/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRawSnippet } from "svelte";
import {
  flushSync,
  mount,
  unmount,
} from "../../../helpers/svelte_client_runtime";
import { set_mock_app_context } from "../../../helpers/mock_app_context";

vi.mock(
  "$lib/app/context/app_context.svelte",
  async () => import("../../../helpers/mock_app_context"),
);
vi.mock(
  "$lib/components/ui/context-menu",
  async () => import("../../../helpers/ui_stubs/context_menu_full"),
);

import EditorContextMenu from "$lib/features/editor/ui/editor_context_menu.svelte";

function build_context(block_selection: Set<number>) {
  const copy_blocks = vi.fn(async () => {});
  const execute = vi.fn(async () => {});
  set_mock_app_context({
    stores: {
      ui: { editor_settings: { markdown_lsp_provider: "none" } },
      markdown_lsp: { status: "idle", transform_actions: [] },
    },
    action_registry: { execute },
    services: {
      editor: {
        get_block_selection: () => block_selection,
        copy_blocks,
      },
    },
  } as never);
  return { copy_blocks };
}

function render(block_selection: Set<number>) {
  const target = document.createElement("div");
  document.body.appendChild(target);
  const ctx = build_context(block_selection);
  const app = mount(EditorContextMenu, {
    target,
    props: {
      children: createRawSnippet(() => ({ render: () => "<span></span>" })),
    },
  });
  flushSync();
  return { ...ctx, cleanup: () => unmount(app) };
}

function click_copy() {
  const copy = Array.from(
    document.querySelectorAll<HTMLButtonElement>("button"),
  ).find((b) => b.textContent?.trim().startsWith("Copy"));
  copy?.click();
  flushSync();
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("editor_context_menu copy routing", () => {
  it("routes a single-block selection to copy_blocks, not execCommand", () => {
    const exec = vi.fn(() => true);
    document.execCommand = exec as never;
    const view = render(new Set([0]));

    click_copy();

    expect(view.copy_blocks).toHaveBeenCalledTimes(1);
    expect(view.copy_blocks).toHaveBeenCalledWith(new Set([0]));
    expect(exec).not.toHaveBeenCalled();

    view.cleanup();
  });

  it("falls back to execCommand when no block is selected", () => {
    const exec = vi.fn(() => true);
    document.execCommand = exec as never;
    const view = render(new Set());

    click_copy();

    expect(view.copy_blocks).not.toHaveBeenCalled();
    expect(exec).toHaveBeenCalledWith("copy");

    view.cleanup();
  });
});
