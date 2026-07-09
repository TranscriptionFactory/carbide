import { describe, expect, it } from "vitest";
import {
  apply_kind_filters,
  sort_omnibar_items,
} from "$lib/features/search/domain/omnibar_view";
import type { OmnibarItem } from "$lib/shared/types/search";
import type { NoteMeta } from "$lib/shared/types/note";
import { as_note_path } from "$lib/shared/types/ids";

function note_meta(id: string, title: string, mtime_ms = 0): NoteMeta {
  return {
    id: as_note_path(id),
    path: as_note_path(id),
    name: title,
    title,
    mtime_ms,
    ctime_ms: 0,
    size_bytes: 0,
    file_type: null,
    blurb: "",
  };
}

function note_item(id: string, title: string, mtime_ms = 0): OmnibarItem {
  return { kind: "note", note: note_meta(id, title, mtime_ms), score: 1 };
}

function recent_note_item(
  id: string,
  title: string,
  mtime_ms = 0,
): OmnibarItem {
  return { kind: "recent_note", note: note_meta(id, title, mtime_ms) };
}

function cross_vault_item(
  id: string,
  title: string,
  mtime_ms = 0,
): OmnibarItem {
  return {
    kind: "cross_vault_note",
    note: note_meta(id, title, mtime_ms),
    vault_id: "vault-b",
    vault_name: "Vault B",
    score: 1,
  };
}

function planned_item(target_path: string): OmnibarItem {
  return { kind: "planned_note", target_path, ref_count: 1, score: 1 };
}

function command_item(id: string, label: string): OmnibarItem {
  return {
    kind: "command",
    command: { id, label, description: "", keywords: [], icon: "settings" },
    score: 0,
  } as OmnibarItem;
}

function setting_item(key: string, label: string): OmnibarItem {
  return {
    kind: "setting",
    setting: { key, label, description: "", category: "Editor", keywords: [] },
    score: 0,
  };
}

const NO_SORT_CONTEXT = { recent_command_ids: [] as string[] };

describe("apply_kind_filters", () => {
  const mixed = [
    note_item("a.md", "A"),
    recent_note_item("b.md", "B"),
    cross_vault_item("c.md", "C"),
    planned_item("d.md"),
    command_item("open_settings", "Open Settings"),
    setting_item("editor.font", "Font"),
  ];

  it("returns items unchanged when no filters are active", () => {
    expect(apply_kind_filters(mixed, [])).toBe(mixed);
  });

  it("keeps all note-like kinds for the notes filter", () => {
    expect(apply_kind_filters(mixed, ["notes"]).map((i) => i.kind)).toEqual([
      "note",
      "recent_note",
      "cross_vault_note",
      "planned_note",
    ]);
  });

  it("keeps only commands for the commands filter", () => {
    expect(apply_kind_filters(mixed, ["commands"]).map((i) => i.kind)).toEqual([
      "command",
    ]);
  });

  it("keeps only settings for the settings filter", () => {
    expect(apply_kind_filters(mixed, ["settings"]).map((i) => i.kind)).toEqual([
      "setting",
    ]);
  });

  it("unions multiple active filters", () => {
    expect(
      apply_kind_filters(mixed, ["commands", "settings"]).map((i) => i.kind),
    ).toEqual(["command", "setting"]);
  });
});

describe("sort_omnibar_items", () => {
  it("preserves input order for relevance", () => {
    const items = [note_item("b.md", "B"), note_item("a.md", "A")];
    expect(sort_omnibar_items(items, "relevance", NO_SORT_CONTEXT)).toBe(items);
  });

  it("sorts by name case-insensitively with numeric ordering", () => {
    const items = [
      note_item("n10.md", "note 10"),
      note_item("b.md", "banana"),
      note_item("n2.md", "Note 2"),
      note_item("a.md", "Apple"),
    ];
    expect(
      sort_omnibar_items(items, "name", NO_SORT_CONTEXT).map(
        (i) => i.kind === "note" && i.note.title,
      ),
    ).toEqual(["Apple", "banana", "Note 2", "note 10"]);
  });

  it("keeps relevance order for name ties", () => {
    const items = [
      note_item("first.md", "Same"),
      note_item("second.md", "same"),
    ];
    expect(
      sort_omnibar_items(items, "name", NO_SORT_CONTEXT).map(
        (i) => i.kind === "note" && i.note.id,
      ),
    ).toEqual(["first.md", "second.md"]);
  });

  it("sorts notes by latest access with mtime fallback for recency", () => {
    const items = [
      note_item("stale.md", "Stale", 1_000),
      note_item("accessed.md", "Accessed", 2_000),
      note_item("edited.md", "Edited", 9_000),
    ];
    const access_history = new Map([["accessed.md", [5_000, 10_000]]]);
    expect(
      sort_omnibar_items(items, "recency", {
        ...NO_SORT_CONTEXT,
        access_history,
      }).map((i) => i.kind === "note" && i.note.id),
    ).toEqual(["accessed.md", "edited.md", "stale.md"]);
  });

  it("tiers recency as notes, then MRU commands, then the rest in input order", () => {
    const items = [
      setting_item("editor.font", "Font"),
      command_item("zoom_in", "Zoom In"),
      command_item("open_settings", "Open Settings"),
      planned_item("planned.md"),
      note_item("a.md", "A", 1_000),
    ];
    const sorted = sort_omnibar_items(items, "recency", {
      recent_command_ids: ["open_settings"],
    });
    expect(
      sorted.map((i) => {
        if (i.kind === "command") return i.command.id;
        if (i.kind === "setting") return i.setting.key;
        if (i.kind === "planned_note") return i.target_path;
        return i.note.id as string;
      }),
    ).toEqual([
      "a.md",
      "open_settings",
      "zoom_in",
      "editor.font",
      "planned.md",
    ]);
  });
});
