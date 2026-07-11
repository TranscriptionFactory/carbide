import type {
  OmnibarFileTypeFilter,
  OmnibarItem,
  OmnibarKindFilter,
  OmnibarSortMode,
} from "$lib/shared/types/search";
import type { AccessHistory } from "$lib/features/search/domain/omnibar_ranking";
import type { CommandDefinition } from "$lib/features/search/types/command_palette";

export type OmnibarSortContext = {
  access_history?: AccessHistory | undefined;
  recent_command_ids: readonly string[];
};

const NAME_COLLATOR = new Intl.Collator(undefined, {
  sensitivity: "base",
  numeric: true,
});

export function mru_comparator(
  recent_command_ids: readonly string[],
): (a: string, b: string) => number {
  const mru_index = new Map(recent_command_ids.map((id, i) => [id, i]));
  return (a, b) => {
    const a_idx = mru_index.get(a);
    const b_idx = mru_index.get(b);
    if (a_idx !== undefined && b_idx !== undefined) return a_idx - b_idx;
    if (a_idx !== undefined) return -1;
    if (b_idx !== undefined) return 1;
    return 0;
  };
}

export function dedupe_commands_by_id(
  commands: readonly CommandDefinition[],
): CommandDefinition[] {
  return [...new Map(commands.map((c) => [c.id, c])).values()];
}

function file_type_matches(
  file_type: string | null,
  filter: OmnibarFileTypeFilter,
): boolean {
  switch (filter) {
    case "markdown":
      return (
        file_type === null || file_type === "markdown" || file_type === "text"
      );
    case "pdf":
      return file_type === "pdf";
    case "code":
      return file_type === "code";
    case "canvas":
      return file_type === "canvas";
    case "image":
      return file_type === "binary";
    default:
      return false;
  }
}

export function apply_file_type_filters(
  items: OmnibarItem[],
  filters: OmnibarFileTypeFilter[],
): OmnibarItem[] {
  if (filters.length === 0) return items;
  return items.filter((item) => {
    if (
      item.kind === "command" ||
      item.kind === "setting" ||
      item.kind === "planned_note"
    )
      return true;
    if (
      item.kind === "note" ||
      item.kind === "recent_note" ||
      item.kind === "cross_vault_note"
    ) {
      return filters.some((f) => file_type_matches(item.note.file_type, f));
    }
    return true;
  });
}

export function apply_kind_filters(
  items: OmnibarItem[],
  filters: OmnibarKindFilter[],
): OmnibarItem[] {
  if (filters.length === 0) return items;
  return items.filter((item) => {
    if (item.kind === "command") return filters.includes("commands");
    if (item.kind === "setting") return filters.includes("settings");
    return filters.includes("notes");
  });
}

function item_title(item: OmnibarItem): string {
  switch (item.kind) {
    case "note":
    case "recent_note":
    case "cross_vault_note":
      return item.note.title || item.note.name;
    case "planned_note":
      return item.target_path;
    case "command":
      return item.command.label;
    case "setting":
      return item.setting.label;
  }
}

function note_recency_ms(
  note: { id: string; mtime_ms: number },
  access_history: AccessHistory | undefined,
): number {
  const history = access_history?.get(note.id);
  const latest = history && history.length > 0 ? Math.max(...history) : 0;
  return Math.max(latest, note.mtime_ms);
}

export function sort_omnibar_items(
  items: OmnibarItem[],
  mode: OmnibarSortMode,
  context: OmnibarSortContext,
): OmnibarItem[] {
  if (mode === "relevance") return items;

  if (mode === "name") {
    return [...items].sort((a, b) =>
      NAME_COLLATOR.compare(item_title(a), item_title(b)),
    );
  }

  const notes: Extract<
    OmnibarItem,
    { kind: "note" | "recent_note" | "cross_vault_note" }
  >[] = [];
  const commands: Extract<OmnibarItem, { kind: "command" }>[] = [];
  const rest: OmnibarItem[] = [];
  for (const item of items) {
    if (
      item.kind === "note" ||
      item.kind === "recent_note" ||
      item.kind === "cross_vault_note"
    ) {
      notes.push(item);
    } else if (item.kind === "command") {
      commands.push(item);
    } else {
      rest.push(item);
    }
  }

  const recency_keys = new Map(
    notes.map((item) => [
      item,
      note_recency_ms(item.note, context.access_history),
    ]),
  );
  notes.sort((a, b) => (recency_keys.get(b) ?? 0) - (recency_keys.get(a) ?? 0));

  const by_mru = mru_comparator(context.recent_command_ids);
  commands.sort((a, b) => by_mru(a.command.id, b.command.id));

  return [...notes, ...commands, ...rest];
}
