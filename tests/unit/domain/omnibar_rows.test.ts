import { describe, expect, it } from "vitest";
import { build_omnibar_rows } from "$lib/features/search/domain/omnibar_rows";
import type { OmnibarVaultGroup } from "$lib/features/search/domain/omnibar_rows";
import type { OmnibarItem } from "$lib/shared/types/search";
import type { NoteMeta } from "$lib/shared/types/note";
import { as_note_path } from "$lib/shared/types/ids";

function note_meta(id: string): NoteMeta {
  return {
    id: as_note_path(id),
    path: as_note_path(id),
    name: id,
    title: id,
    mtime_ms: 0,
    ctime_ms: 0,
    size_bytes: 0,
    file_type: null,
    blurb: "",
  };
}

function cross_vault_item(id: string, vault_id: string): OmnibarItem {
  return {
    kind: "cross_vault_note",
    note: note_meta(id),
    vault_id,
    vault_name: vault_id,
    score: 1,
  };
}

function group(vault_id: string, items: OmnibarItem[]): OmnibarVaultGroup {
  return {
    vault_id,
    vault_name: vault_id,
    items,
    vault_note_count: null,
    vault_last_opened_at: null,
    vault_is_available: true,
  };
}

describe("build_omnibar_rows", () => {
  const a1 = cross_vault_item("a1", "vault-a");
  const a2 = cross_vault_item("a2", "vault-a");
  const b1 = cross_vault_item("b1", "vault-b");
  const c1 = cross_vault_item("c1", "vault-c");
  const groups = [
    group("vault-a", [a1, a2]),
    group("vault-b", [b1]),
    group("vault-c", [c1]),
  ];

  it("interleaves headers with items in group order", () => {
    const rows = build_omnibar_rows(groups, new Set());
    expect(rows).toEqual([
      { kind: "vault_group_header", group: groups[0] },
      a1,
      a2,
      { kind: "vault_group_header", group: groups[1] },
      b1,
      { kind: "vault_group_header", group: groups[2] },
      c1,
    ]);
  });

  it("emits header only for a collapsed group", () => {
    const rows = build_omnibar_rows(groups, new Set(["vault-a"]));
    expect(rows).toEqual([
      { kind: "vault_group_header", group: groups[0] },
      { kind: "vault_group_header", group: groups[1] },
      b1,
      { kind: "vault_group_header", group: groups[2] },
      c1,
    ]);
  });

  it("keeps header order stable regardless of other groups' collapse state", () => {
    const combos = [
      new Set<string>(),
      new Set(["vault-b"]),
      new Set(["vault-a", "vault-c"]),
      new Set(["vault-a", "vault-b", "vault-c"]),
    ];
    for (const collapsed of combos) {
      const header_ids = build_omnibar_rows(groups, collapsed)
        .filter((row) => row.kind === "vault_group_header")
        .map((row) => row.group.vault_id);
      expect(header_ids).toEqual(["vault-a", "vault-b", "vault-c"]);
    }
    const expanded = build_omnibar_rows(groups, new Set());
    const last_collapsed = build_omnibar_rows(groups, new Set(["vault-c"]));
    expect(last_collapsed.slice(0, 6)).toEqual(expanded.slice(0, 6));
  });
});
