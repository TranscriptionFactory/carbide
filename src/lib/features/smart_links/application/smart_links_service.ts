import type { SearchPort } from "$lib/features/search";
import type { VaultStore } from "$lib/features/vault";
import type { SmartLinksStore } from "$lib/features/smart_links/state/smart_links_store.svelte";
import type { VaultId } from "$lib/shared/types/ids";
import { create_logger } from "$lib/shared/utils/logger";
import { error_message } from "$lib/shared/utils/error_message";

const log = create_logger("smart_links_service");

export class SmartLinksService {
  constructor(
    private readonly search_port: SearchPort,
    private readonly vault_store: VaultStore,
    private readonly smart_links_store: SmartLinksStore,
  ) {}

  private get_active_vault_id(): VaultId | null {
    return this.vault_store.vault?.id ?? null;
  }

  async load_rules(): Promise<void> {
    const vault_id = this.get_active_vault_id();
    if (!vault_id) {
      this.smart_links_store.clear();
      return;
    }

    this.smart_links_store.start_rules_load();

    try {
      const groups = await this.search_port.load_smart_link_rules(vault_id);
      this.smart_links_store.set_rule_groups(groups);
    } catch (error) {
      const message = error_message(error);
      log.error("Failed to load smart link rules", { error: message });
      this.smart_links_store.set_rules_error(message);
    }
  }

  async save_rules(): Promise<void> {
    const vault_id = this.get_active_vault_id();
    if (!vault_id) return;

    try {
      await this.search_port.save_smart_link_rules(
        vault_id,
        this.smart_links_store.rule_groups,
      );
    } catch (error) {
      const message = error_message(error);
      log.error("Failed to save smart link rules", { error: message });
    }
  }

  async toggle_rule(
    group_id: string,
    rule_id: string,
    enabled: boolean,
  ): Promise<void> {
    this.smart_links_store.update_rule(group_id, rule_id, { enabled });
    await this.save_rules();
  }

  async update_weight(
    group_id: string,
    rule_id: string,
    weight: number,
  ): Promise<void> {
    this.smart_links_store.update_rule(group_id, rule_id, { weight });
    await this.save_rules();
  }

  async toggle_group(group_id: string, enabled: boolean): Promise<void> {
    this.smart_links_store.update_group_enabled(group_id, enabled);
    await this.save_rules();
  }

  clear() {
    this.smart_links_store.clear();
  }
}
