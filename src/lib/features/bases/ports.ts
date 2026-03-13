import type { VaultId } from "$lib/shared/types/ids";
import type { NoteMeta } from "$lib/shared/types/note";

export interface PropertyValue {
  value: string;
  property_type: string;
}

export interface BaseNoteRow {
  note: NoteMeta;
  properties: Record<string, PropertyValue>;
  tags: string[];
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
}

export interface BaseViewDefinition {
  name: string;
  query: BaseQuery;
  view_mode: string;
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
}
