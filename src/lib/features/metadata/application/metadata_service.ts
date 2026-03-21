import type { MetadataPort } from "../ports";
import type { MetadataStore } from "../state/metadata_store.svelte";
import type { VaultStore } from "$lib/features/vault";

export class MetadataService {
  constructor(
    private readonly port: MetadataPort,
    private readonly store: MetadataStore,
    private readonly vault_store: VaultStore,
  ) {}

  async refresh(note_path: string) {
    const vault = this.vault_store.vault;
    if (!vault) return;

    this.store.set_loading(true);
    this.store.set_error(null);
    try {
      const metadata = await this.port.get_note_metadata(vault.id, note_path);
      this.store.set_metadata(note_path, metadata.properties, metadata.tags);
    } catch (e) {
      this.store.set_error(e instanceof Error ? e.message : String(e));
    } finally {
      this.store.set_loading(false);
    }
  }

  clear() {
    this.store.clear();
  }
}
