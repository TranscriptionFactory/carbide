import type { VaultId } from "$lib/shared/types/ids";
import type { NoteMeta } from "$lib/shared/types/note";
import type { NoteStats } from "$lib/features/search";

export interface PropertyValue {
  value: string;
  property_type: string;
}

export interface BaseNoteRow {
  note: NoteMeta;
  properties: Record<string, PropertyValue>;
  tags: string[];
  stats: NoteStats;
  content_snippet?: string;
  first_image_path?: string;
}

export interface BaseQueryResults {
  rows: BaseNoteRow[];
  total: number;
}

export interface BaseFilter {
  property: string;
  operator: string;
  value: string;
}

export interface BaseSort {
  property: string;
  descending: boolean;
}

export interface BaseQuery {
  filters: BaseFilter[];
  sort: BaseSort[];
  limit: number;
  offset: number;
}

export interface PropertyInfo {
  name: string;
  property_type: string;
  count: number;
  unique_values: string[] | null;
}

export type ViewMode =
  | "table"
  | "list"
  | "kanban"
  | "gallery"
  | "calendar"
  | "tree";

export type KanbanConfig = {
  group_by: string;
  column_order?: string[];
};

export type CalendarConfig = {
  date_property: string;
};

export type TreeConfig = {
  group_by: string[];
  date_format?: string;
};

export interface BaseViewDefinition {
  name: string;
  query: BaseQuery;
  view_mode: string;
  kanban_config?: KanbanConfig;
  calendar_config?: CalendarConfig;
  tree_config?: TreeConfig;
}

export interface SavedViewInfo {
  name: string;
  path: string;
}

export interface BasesPort {
  list_properties(vault_id: VaultId): Promise<PropertyInfo[]>;
  query(vault_id: VaultId, query: BaseQuery): Promise<BaseQueryResults>;
  save_view(
    vault_id: VaultId,
    path: string,
    view: BaseViewDefinition,
  ): Promise<void>;
  load_view(vault_id: VaultId, path: string): Promise<BaseViewDefinition>;
  list_views(vault_id: VaultId): Promise<SavedViewInfo[]>;
  delete_view(vault_id: VaultId, path: string): Promise<void>;
  update_property(
    vault_id: VaultId,
    note_path: string,
    key: string,
    value: string,
  ): Promise<void>;
  seed_default_views(vault_id: VaultId): Promise<number>;
}
