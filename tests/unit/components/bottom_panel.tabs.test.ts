/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "$lib/app/context/app_context.svelte",
  async () => import("../helpers/mock_app_context"),
);

import { create_app_stores } from "$lib/app/bootstrap/create_app_stores";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import type { AppContext } from "$lib/app/di/create_app_context";
import type { Diagnostic, DiagnosticSeverity } from "$lib/features/diagnostics";
import type { BottomPanelTab } from "$lib/app/orchestration/ui_store.svelte";
import BottomPanel from "$lib/app/bootstrap/ui/bottom_panel.svelte";
import { render_with_app_context } from "../helpers/render_with_app_context";
import { flushSync } from "../helpers/svelte_client_runtime";

function make_diagnostic(severity: DiagnosticSeverity): Diagnostic {
  return {
    source: "lint",
    line: 1,
    column: 1,
    end_line: 1,
    end_column: 2,
    severity,
    message: "issue",
    rule_id: null,
    fixable: false,
  };
}

function render_bottom_panel(initial_tab: BottomPanelTab = "problems") {
  const stores = create_app_stores();
  stores.ui.bottom_panel_tab = initial_tab;
  stores.ui.bottom_panel_open = true;
  const action_registry = { execute: vi.fn().mockResolvedValue(undefined) };
  const rendered = render_with_app_context(BottomPanel, {
    app_context: {
      stores,
      action_registry,
    } as unknown as Partial<AppContext>,
  });
  return { stores, action_registry, ...rendered };
}

function click(target: Element, testid: string) {
  const el = target.querySelector<HTMLButtonElement>(
    `[data-testid="${testid}"]`,
  );
  expect(el).not.toBeNull();
  el!.click();
  flushSync();
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("bottom_panel tabs", () => {
  it("updates the active tab store on trigger click", () => {
    const { stores, target, cleanup } = render_bottom_panel("problems");
    click(target, "bottom-panel-tab-query");
    expect(stores.ui.bottom_panel_tab).toBe("query");
    cleanup();
  });

  it("opens the terminal store when the terminal trigger is clicked", () => {
    const { stores, target, cleanup } = render_bottom_panel("problems");
    const open_spy = vi.spyOn(stores.terminal, "open");
    click(target, "bottom-panel-tab-terminal");
    expect(stores.ui.bottom_panel_tab).toBe("terminal");
    expect(open_spy).toHaveBeenCalled();
    cleanup();
  });

  it("closes the panel via the ui store on a non-terminal tab", () => {
    const { stores, action_registry, target, cleanup } =
      render_bottom_panel("problems");
    click(target, "bottom-panel-close");
    expect(stores.ui.bottom_panel_open).toBe(false);
    expect(action_registry.execute).not.toHaveBeenCalled();
    cleanup();
  });

  it("closes the terminal via the action registry on the terminal tab", () => {
    const { stores, action_registry, target, cleanup } =
      render_bottom_panel("terminal");
    click(target, "bottom-panel-close");
    expect(action_registry.execute).toHaveBeenCalledWith(
      ACTION_IDS.terminal_close,
    );
    expect(stores.ui.bottom_panel_open).toBe(true);
    cleanup();
  });

  it("shows the problems badge as the error+warning sum", () => {
    const stores = create_app_stores();
    stores.ui.bottom_panel_tab = "problems";
    stores.ui.bottom_panel_open = true;
    stores.diagnostics.push("lint", "a.md", [
      make_diagnostic("error"),
      make_diagnostic("error"),
      make_diagnostic("warning"),
    ]);
    const { target, cleanup } = render_with_app_context(BottomPanel, {
      app_context: {
        stores,
        action_registry: { execute: vi.fn() },
      } as unknown as Partial<AppContext>,
    });
    const badge = target.querySelector(
      '[data-testid="bottom-panel-tab-problems"] .BottomPanel__badge',
    );
    expect(badge?.textContent).toBe("3");
    cleanup();
  });
});
