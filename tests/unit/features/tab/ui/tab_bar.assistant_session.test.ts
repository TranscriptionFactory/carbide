/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync } from "../../../helpers/svelte_client_runtime";

vi.mock(
  "$lib/app/context/app_context.svelte",
  async () => import("../../../helpers/mock_app_context"),
);
vi.mock(
  "$lib/components/ui/tooltip/index.js",
  async () => import("../../../helpers/ui_stubs/tooltip"),
);
vi.mock(
  "$lib/components/ui/context-menu",
  async () => import("../../../helpers/ui_stubs/context_menu"),
);

import type { Tab } from "$lib/features/tab/types/tab";
import {
  assistant_session_tab_id,
  ASSISTANT_SESSION_TAB_TITLE,
} from "$lib/features/tab/domain/assistant_session_tab";
import {
  get_all_by_testid,
  install_dom_stubs,
  render_tab_bar,
} from "./tab_bar_fixture";
import { make_session } from "../../../helpers/assistant_session_fixtures";

function make_assistant_tab(session_id: string, title: string): Tab {
  return {
    id: assistant_session_tab_id(session_id),
    title,
    is_pinned: false,
    is_dirty: false,
    pane: "primary",
    kind: "assistant_session",
    session_id,
  };
}

beforeEach(() => {
  install_dom_stubs();
});

afterEach(() => {
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("tab_bar assistant_session tabs", () => {
  it("labels the tab with the session's current title", () => {
    const view = render_tab_bar({
      tabs: [make_assistant_tab("s1", ASSISTANT_SESSION_TAB_TITLE)],
    });
    view.stores.assistant_sessions.sessions = [
      make_session({ id: "s1", title: "How do backlinks work?" }),
    ];
    flushSync();

    const tabs = get_all_by_testid("tab-bar-tab");
    expect(tabs).toHaveLength(1);
    expect(tabs[0]?.textContent).toContain("How do backlinks work?");

    view.cleanup();
  });

  it("tracks a session rename without reopening the tab", () => {
    const view = render_tab_bar({
      tabs: [make_assistant_tab("s1", ASSISTANT_SESSION_TAB_TITLE)],
    });
    view.stores.assistant_sessions.sessions = [
      make_session({ id: "s1", title: "Original title" }),
    ];
    flushSync();
    expect(get_all_by_testid("tab-bar-tab")[0]?.textContent).toContain(
      "Original title",
    );

    view.stores.assistant_sessions.sessions = [
      make_session({ id: "s1", title: "Renamed by the user" }),
    ];
    flushSync();

    const tabs = get_all_by_testid("tab-bar-tab");
    expect(tabs).toHaveLength(1);
    expect(tabs[0]?.textContent).toContain("Renamed by the user");
    expect(tabs[0]?.textContent).not.toContain("Original title");

    view.cleanup();
  });

  it("falls back to the tab title when the session was pruned", () => {
    const view = render_tab_bar({
      tabs: [make_assistant_tab("pruned", ASSISTANT_SESSION_TAB_TITLE)],
    });
    view.stores.assistant_sessions.sessions = [make_session({ id: "other" })];
    flushSync();

    expect(get_all_by_testid("tab-bar-tab")[0]?.textContent).toContain(
      ASSISTANT_SESSION_TAB_TITLE,
    );

    view.cleanup();
  });
});
