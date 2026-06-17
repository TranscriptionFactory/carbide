import { describe, it, expect } from "vitest";
import { DocumentStore } from "$lib/features/document/state/document_store.svelte";

describe("html document scroll persistence", () => {
  function open_html_tab(store: DocumentStore, tab_id: string) {
    store.set_viewer_state(tab_id, {
      tab_id,
      file_path: "docs/page.html",
      file_type: "html",
      zoom: 1,
      scroll_top: 0,
      pdf_page: 1,
      cfi: null,
      html_view_mode: "safe",
      load_status: "idle",
      error_message: null,
    });
  }

  it("stores scroll offset when update_scroll is called", () => {
    const store = new DocumentStore();
    open_html_tab(store, "tab-1");

    store.update_scroll("tab-1", 420);

    expect(store.get_viewer_state("tab-1")?.scroll_top).toBe(420);
  });

  it("initial scroll_top is zero for a newly opened html tab", () => {
    const store = new DocumentStore();
    open_html_tab(store, "tab-2");

    expect(store.get_viewer_state("tab-2")?.scroll_top).toBe(0);
  });

  it("retains scroll when switching back to the tab", () => {
    const store = new DocumentStore();
    open_html_tab(store, "tab-a");
    open_html_tab(store, "tab-b");

    store.update_scroll("tab-a", 300);
    store.update_scroll("tab-b", 50);

    expect(store.get_viewer_state("tab-a")?.scroll_top).toBe(300);
    expect(store.get_viewer_state("tab-b")?.scroll_top).toBe(50);
  });

  it("subsequent scroll updates overwrite the previous value", () => {
    const store = new DocumentStore();
    open_html_tab(store, "tab-1");

    store.update_scroll("tab-1", 100);
    store.update_scroll("tab-1", 250);

    expect(store.get_viewer_state("tab-1")?.scroll_top).toBe(250);
  });

  it("update_scroll on unknown tab is a no-op", () => {
    const store = new DocumentStore();

    expect(() => store.update_scroll("nonexistent", 100)).not.toThrow();
    expect(store.get_viewer_state("nonexistent")).toBeUndefined();
  });
});
