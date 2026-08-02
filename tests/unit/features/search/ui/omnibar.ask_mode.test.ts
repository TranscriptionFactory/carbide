/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "svelte";
import {
  flushSync,
  mount,
  unmount,
} from "../../../helpers/svelte_client_runtime";

vi.mock(
  "$lib/components/ui/dialog/index.js",
  async () => import("../../../helpers/ui_stubs/dialog"),
);

import Omnibar from "$lib/features/search/ui/omnibar.svelte";
import type { OmnibarAskView } from "$lib/features/search/types/omnibar_ask";

type OmnibarProps = ComponentProps<typeof Omnibar>;

let mounted: Array<{ app: ReturnType<typeof mount>; target: HTMLElement }> = [];

function ask_view(): OmnibarAskView {
  return {
    draft: "",
    session: null,
    status: "idle",
    error: null,
    can_insert: false,
    provider_label: "claude",
    on_draft_change: vi.fn(),
    on_submit: vi.fn(),
    on_insert: vi.fn(),
    on_promote: vi.fn(),
    on_stop: vi.fn(),
    on_dismiss: vi.fn(),
  };
}

function render_omnibar(overrides: Partial<OmnibarProps> = {}) {
  const props: OmnibarProps = {
    open: true,
    query: "",
    selected_index: 0,
    is_searching: false,
    scope: "current_vault",
    file_type_filters: [],
    kind_filters: [],
    sort_mode: "relevance",
    items: [],
    recent_notes: [],
    recent_command_ids: [],
    hotkeys_config: { bindings: [] },
    has_multiple_vaults: false,
    plugin_commands: [],
    on_open_change: vi.fn(),
    on_query_change: vi.fn(),
    on_selected_index_change: vi.fn(),
    on_scope_change: vi.fn(),
    on_toggle_file_type_filter: vi.fn(),
    on_toggle_kind_filter: vi.fn(),
    on_sort_mode_change: vi.fn(),
    on_clear_filters: vi.fn(),
    on_confirm: vi.fn(),
    on_view_as_graph: vi.fn(),
    ...overrides,
  };

  const target = document.createElement("div");
  document.body.appendChild(target);
  const app = mount(Omnibar, { target, props });
  mounted.push({ app, target });
  flushSync();

  return {
    target,
    press_toggle() {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "/",
          metaKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
      flushSync();
    },
    in_ask_mode() {
      return target.querySelector('[data-testid="omnibar-ask"]') !== null;
    },
  };
}

// jsdom does not implement scrollIntoView and the omnibar's selection effect
// calls it; installed and removed rather than saved and restored, because
// there is nothing there to restore.
beforeEach(() => {
  Element.prototype.scrollIntoView = () => undefined;
});

afterEach(() => {
  Reflect.deleteProperty(Element.prototype, "scrollIntoView");
  for (const { app, target } of mounted) {
    void unmount(app);
    target.remove();
  }
  mounted = [];
  document.body.innerHTML = "";
});

describe("omnibar Ask mode", () => {
  it("toggles into and back out of Ask on the mode shortcut", () => {
    const view = render_omnibar({ ask: ask_view() });

    expect(view.in_ask_mode()).toBe(false);

    view.press_toggle();
    expect(view.in_ask_mode()).toBe(true);

    view.press_toggle();
    expect(view.in_ask_mode()).toBe(false);
  });

  it("offers the Ask segment in search mode so the surface is discoverable", () => {
    const view = render_omnibar({ ask: ask_view() });

    expect(
      view.target.querySelector('[data-testid="omnibar-ask-toggle"]'),
    ).not.toBeNull();
  });

  it("stays a pure search palette when no ask view is supplied", () => {
    const view = render_omnibar();

    view.press_toggle();

    expect(view.in_ask_mode()).toBe(false);
    expect(
      view.target.querySelector('[data-testid="omnibar-ask-toggle"]'),
    ).toBeNull();
  });
});
