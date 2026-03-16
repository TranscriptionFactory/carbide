import { describe, expect, it } from "vitest";
import { BasesStore } from "$lib/features/bases/state/bases_store.svelte";
import type { BaseNoteRow, PropertyInfo } from "$lib/features/bases/ports";

function make_note_row(id: string): BaseNoteRow {
  return {
    note: {
      id: id as never,
      path: `${id}.md` as never,
      name: id,
      title: id,
      mtime_ms: 0,
      size_bytes: 0,
    },
    properties: {},
    tags: [],
  };
}

function make_property(name: string): PropertyInfo {
  return { name, property_type: "text", count: 1 };
}

describe("BasesStore", () => {
  it("has correct initial state", () => {
    const store = new BasesStore();

    expect(store.available_properties).toEqual([]);
    expect(store.result_set).toEqual([]);
    expect(store.total_count).toBe(0);
    expect(store.loading).toBe(false);
    expect(store.error).toBeNull();
    expect(store.active_view_mode).toBe("table");
    expect(store.query).toEqual({
      filters: [],
      sort: [],
      limit: 100,
      offset: 0,
    });
  });

  it("set loading updates loading state", () => {
    const store = new BasesStore();

    store.loading = true;

    expect(store.loading).toBe(true);
  });

  it("set_results updates result_set and total_count", () => {
    const store = new BasesStore();
    const rows = [make_note_row("note-a"), make_note_row("note-b")];

    store.set_results({ rows, total: 42 });

    expect(store.result_set).toEqual(rows);
    expect(store.total_count).toBe(42);
  });

  it("set_results with empty rows resets result_set", () => {
    const store = new BasesStore();
    store.set_results({ rows: [make_note_row("note-a")], total: 1 });

    store.set_results({ rows: [], total: 0 });

    expect(store.result_set).toEqual([]);
    expect(store.total_count).toBe(0);
  });

  it("setting error updates error state", () => {
    const store = new BasesStore();

    store.error = "Something went wrong";

    expect(store.error).toBe("Something went wrong");
  });

  it("setting error to null clears error state", () => {
    const store = new BasesStore();
    store.error = "Previous error";

    store.error = null;

    expect(store.error).toBeNull();
  });

  it("setting available_properties updates properties", () => {
    const store = new BasesStore();
    const props = [make_property("title"), make_property("status")];

    store.available_properties = props;

    expect(store.available_properties).toEqual(props);
  });

  it("loading false after reset", () => {
    const store = new BasesStore();
    store.loading = true;

    store.loading = false;

    expect(store.loading).toBe(false);
  });

  it("active_view_mode can be switched to list", () => {
    const store = new BasesStore();

    store.active_view_mode = "list";

    expect(store.active_view_mode).toBe("list");
  });

  it("query can be updated with filters", () => {
    const store = new BasesStore();

    store.query = {
      filters: [{ property: "status", operator: "eq", value: "done" }],
      sort: [],
      limit: 50,
      offset: 10,
    };

    expect(store.query.filters).toHaveLength(1);
    expect(store.query.limit).toBe(50);
    expect(store.query.offset).toBe(10);
  });
});
