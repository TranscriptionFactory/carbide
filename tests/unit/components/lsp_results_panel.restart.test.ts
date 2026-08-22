/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import LspResultsPanelContent from "$lib/features/lsp/ui/lsp_results_panel_content.svelte";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import { flushSync, mount, unmount } from "../helpers/svelte_client_runtime";

const { execute } = vi.hoisted(() => ({
  execute: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("$lib/app/context/app_context.svelte", () => ({
  use_app_context: () => ({
    action_registry: { execute },
    stores: {
      lsp: {
        code_actions: [],
        diagnostics: [],
        hover_content: null,
        active_lsp_tab: "code_actions",
        set_hover: vi.fn(),
      },
      markdown_lsp: {
        status: { failed: { message: "Process crashed repeatedly" } },
        effective_provider: "iwes",
        capabilities: null,
      },
      ui: { editor_settings: { markdown_lsp_enabled: true } },
      code_lsp: { server_statuses: new Map() },
      editor: { open_note: null },
    },
  }),
}));

afterEach(() => {
  execute.mockClear();
  document.body.innerHTML = "";
});

describe("LSP results terminal failure", () => {
  it("offers a manual restart action", async () => {
    const target = document.createElement("div");
    document.body.appendChild(target);
    const component = mount(LspResultsPanelContent, { target });
    flushSync();

    const button = [...target.querySelectorAll("button")].find(
      (candidate) => candidate.textContent?.trim() === "Restart",
    );
    expect(button).toBeDefined();
    button?.click();
    flushSync();

    expect(execute).toHaveBeenCalledWith(ACTION_IDS.markdown_lsp_restart);
    await unmount(component);
  });
});
