import type { TagPort } from "../ports";
import type { TagStore } from "../state/tag_store.svelte";
import type { VaultStore } from "$lib/features/vault";

export class TagService {
  constructor(
    private readonly port: TagPort,
    private readonly store: TagStore,
    private readonly vault_store: VaultStore,
  ) {}

  async refresh_tags() {
    const vault = this.vault_store.vault;
    if (!vault) return;

    this.store.set_loading(true);
    this.store.set_error(null);
    try {
      const tags = await this.port.list_all_tags(vault.id);
      this.store.set_tags(tags);
    } catch (e) {
      this.store.set_error(e instanceof Error ? e.message : String(e));
    } finally {
      this.store.set_loading(false);
    }
  }

  deselect_tag() {
    this.store.select_tag(null);
    this.store.set_notes_for_tag([]);
  }

  async select_tag(tag: string) {
    const vault = this.vault_store.vault;
    if (!vault) return;

    this.store.select_tag(tag);
    this.store.set_notes_for_tag([]);
    this.store.set_notes_loading(true);
    try {
      const notes = await this.port.get_notes_for_tag(vault.id, tag);
      this.store.set_notes_for_tag(notes);
    } catch (e) {
      this.store.set_error(e instanceof Error ? e.message : String(e));
    } finally {
      this.store.set_notes_loading(false);
    }
  }
}
