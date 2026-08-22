import { describe, expect, it } from "vitest";
import {
  apply_kind_filters,
  dedupe_commands_by_id,
  sort_omnibar_items,
} from "$lib/features/search/domain/omnibar_view";
import type { OmnibarItem } from "$lib/shared/types/search";
import type { CommandDefinition } from "$lib/features/search/types/command_palette";
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

describe("dedupe_commands_by_id", () => {
  function command_def(id: string, label: string): CommandDefinition {
    return {
      id: id as CommandDefinition["id"],
      label,
      description: "",
      keywords: [],
      icon: "settings",
    };
  }

  it("returns commands unchanged when all ids are unique", () => {
    const commands = [command_def("a", "A"), command_def("b", "B")];
    expect(dedupe_commands_by_id(commands)).toEqual(commands);
  });

  it("keeps the last command for a duplicated id, matching search-path merge semantics", () => {
    const builtin = command_def("open_settings", "Built-in Settings");
    const plugin = command_def("open_settings", "Plugin Settings");
    expect(dedupe_commands_by_id([builtin, plugin])).toEqual([plugin]);
  });

  it("preserves first-occurrence order across multiple collisions", () => {
    const commands = [
      command_def("a", "A1"),
      command_def("b", "B"),
      command_def("a", "A2"),
      command_def("c", "C"),
      command_def("b", "B2"),
    ];
    expect(dedupe_commands_by_id(commands).map((c) => c.label)).toEqual([
      "A2",
      "B2",
      "C",
    ]);
  });
});

describe("sort_omnibar_items", () => {
  it("preserves input order for relevance", () => {
    const items = [note_item("b.md", "B"), note_item("a.md", "A")];
    expect(sort_omnibar_items(items, "relevance", NO_SORT_CONTEXT, true)).toBe(
      items,
    );
  });

  it("sorts by name case-insensitively with numeric ordering", () => {
    const items = [
      note_item("n10.md", "note 10"),
      note_item("b.md", "banana"),
      note_item("n2.md", "Note 2"),
      note_item("a.md", "Apple"),
    ];
    expect(
      sort_omnibar_items(items, "name", NO_SORT_CONTEXT, true).map(
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
      sort_omnibar_items(items, "name", NO_SORT_CONTEXT, true).map(
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
      sort_omnibar_items(
        items,
        "recency",
        {
          ...NO_SORT_CONTEXT,
          access_history,
        },
        false,
      ).map((i) => i.kind === "note" && i.note.id),
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
    const sorted = sort_omnibar_items(
      items,
      "recency",
      { recent_command_ids: ["open_settings"] },
      false,
    );
    expect(
      sorted.map((i) => {
        if (i.kind === "command") return i.command.id;
        if (i.kind === "setting") return i.setting.key;
        if (i.kind === "planned_note") return i.target_path;
        if (i.kind === "folder") return i.path;
        return i.note.id as string;
      }),
    ).toEqual([
      "a.md",
      "zoom_in",
      "open_settings",
      "editor.font",
      "planned.md",
    ]);
  });
});

describe("omnibar sort direction", () => {
  it("inverts name order without changing relevance", () => {
    const items = [note_item("b.md", "Beta"), note_item("a.md", "Alpha")];
    expect(
      sort_omnibar_items(items, "name", NO_SORT_CONTEXT, false).map(
        (item) => item.kind === "note" && item.note.title,
      ),
    ).toEqual(["Beta", "Alpha"]);
    expect(sort_omnibar_items(items, "relevance", NO_SORT_CONTEXT, false)).toBe(
      items,
    );
  });

  it("keeps recency tiers stable while reversing within tiers", () => {
    const items = [
      command_item("zoom_in", "Zoom In"),
      note_item("old.md", "Old", 1),
      command_item("open_settings", "Open Settings"),
      note_item("new.md", "New", 2),
    ];
    const context = { recent_command_ids: ["open_settings", "zoom_in"] };
    const descending = sort_omnibar_items(items, "recency", context, false);
    const ascending = sort_omnibar_items(items, "recency", context, true);
    expect(descending.map((item) => item.kind)).toEqual([
      "note",
      "note",
      "command",
      "command",
    ]);
    expect(ascending.map((item) => item.kind)).toEqual([
      "note",
      "note",
      "command",
      "command",
    ]);
    const labels = (sorted: OmnibarItem[]) =>
      sorted.map((item) => {
        if (item.kind === "command") return item.command.id;
        if (
          item.kind === "note" ||
          item.kind === "recent_note" ||
          item.kind === "cross_vault_note"
        )
          return item.note.id;
        throw new Error(`Unexpected item kind: ${item.kind}`);
      });
    expect(labels(descending)).toEqual([
      "new.md",
      "old.md",
      "zoom_in",
      "open_settings",
    ]);
    expect(labels(ascending)).toEqual([
      "old.md",
      "new.md",
      "open_settings",
      "zoom_in",
    ]);
  });
});
