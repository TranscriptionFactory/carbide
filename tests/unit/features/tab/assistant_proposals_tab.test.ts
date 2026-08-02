import { describe, expect, it } from "vitest";
import { TabStore } from "$lib/features/tab/state/tab_store.svelte";
import {
  ASSISTANT_PROPOSALS_TAB_ID,
  ASSISTANT_PROPOSALS_TAB_TITLE,
} from "$lib/features/tab/domain/assistant_proposals_tab";

describe("assistant_proposals tab id", () => {
  it("is a fixed singleton id, unlike a per-session tab", () => {
    expect(ASSISTANT_PROPOSALS_TAB_ID).toBe("__assistant_proposals__");
  });
});

describe("opening the assistant_proposals tab", () => {
  it("creates a tab of the right kind and activates it", () => {
    const tab_store = new TabStore();

    const tab = tab_store.open_assistant_proposals_tab(
      ASSISTANT_PROPOSALS_TAB_ID,
      ASSISTANT_PROPOSALS_TAB_TITLE,
    );

    expect(tab.kind).toBe("assistant_proposals");
    expect(tab).toMatchObject({
      id: ASSISTANT_PROPOSALS_TAB_ID,
      title: ASSISTANT_PROPOSALS_TAB_TITLE,
      is_dirty: false,
    });
    expect(tab_store.active_tab_id).toBe(tab.id);
    expect(tab_store.tabs).toHaveLength(1);
  });

  it("reactivates the existing tab instead of opening a duplicate", () => {
    const tab_store = new TabStore();

    const first = tab_store.open_assistant_proposals_tab(
      ASSISTANT_PROPOSALS_TAB_ID,
      ASSISTANT_PROPOSALS_TAB_TITLE,
    );
    const second = tab_store.open_assistant_proposals_tab(
      ASSISTANT_PROPOSALS_TAB_ID,
      ASSISTANT_PROPOSALS_TAB_TITLE,
    );

    expect(tab_store.tabs).toHaveLength(1);
    expect(second.id).toBe(first.id);
    expect(tab_store.active_tab_id).toBe(first.id);
  });

  it("reactivating from a different tab moves focus back without duplicating", () => {
    const tab_store = new TabStore();
    tab_store.open_assistant_proposals_tab(
      ASSISTANT_PROPOSALS_TAB_ID,
      ASSISTANT_PROPOSALS_TAB_TITLE,
    );
    tab_store.open_bases_tab("__bases__", "Bases");

    tab_store.open_assistant_proposals_tab(
      ASSISTANT_PROPOSALS_TAB_ID,
      ASSISTANT_PROPOSALS_TAB_TITLE,
    );

    expect(tab_store.tabs).toHaveLength(2);
    expect(tab_store.active_tab_id).toBe(ASSISTANT_PROPOSALS_TAB_ID);
  });
});
