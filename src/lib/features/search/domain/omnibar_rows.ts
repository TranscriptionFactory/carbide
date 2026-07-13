import type { OmnibarItem } from "$lib/shared/types/search";

export type OmnibarVaultGroup = {
  vault_name: string;
  vault_id: string;
  items: OmnibarItem[];
  vault_note_count: number | null;
  vault_last_opened_at: number | null;
  vault_is_available: boolean;
};

export type OmnibarRow =
  | OmnibarItem
  | { kind: "vault_group_header"; group: OmnibarVaultGroup };

export function build_omnibar_rows(
  groups: OmnibarVaultGroup[],
  collapsed: ReadonlySet<string>,
): OmnibarRow[] {
  return groups.flatMap((group): OmnibarRow[] => [
    { kind: "vault_group_header", group },
    ...(collapsed.has(group.vault_id) ? [] : group.items),
  ]);
}
