import type { VaultId } from "$lib/shared/types/ids";
import type { NoteMeta } from "$lib/shared/types/note";

export const TYPE_DEFINITION_MARKER = "Type";

export type BackendTypeCount = {
  name: string;
  count: number;
};

export type TypeDefinition = {
  name: string;
  path: string;
  icon?: string;
  color?: string;
  order?: number;
  label?: string;
  visible?: boolean;
  template?: string;
};

export type TypeSection = {
  name: string;
  label: string;
  path?: string;
  icon: string;
  color: string;
  order: number;
  count: number;
  visible: boolean;
};

export interface TypesPort {
  list_types(vault_id: VaultId): Promise<BackendTypeCount[]>;
  list_definition_notes(vault_id: VaultId): Promise<NoteMeta[]>;
}
