import type { TagPort } from "../ports";
import type { TagStore } from "../state/tag_store.svelte";
import type { VaultSettingsPort, VaultStore } from "$lib/features/vault";
import {
  TAG_COLORS_SETTING_KEY,
  sanitize_tag_colors,
  with_tag_color,
  without_tag_color,
} from "../domain/tag_colors";

export class TagService {
  constructor(
    private readonly port: TagPort,
    private readonly store: TagStore,
    private readonly vault_store: VaultStore,
    private readonly vault_settings_port?: VaultSettingsPort,
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

  async load_tag_colors() {
    const vault = this.vault_store.vault;
    if (!vault || !this.vault_settings_port) return;
    try {
      const raw = await this.vault_settings_port.get_vault_setting<unknown>(
        vault.id,
        TAG_COLORS_SETTING_KEY,
      );
      this.store.set_tag_colors(sanitize_tag_colors(raw));
    } catch (e) {
      this.store.set_error(e instanceof Error ? e.message : String(e));
    }
  }

  async set_tag_color(tag: string, color: string) {
    const next = with_tag_color(this.store.tag_colors, tag, color);
    if (!next || next === this.store.tag_colors) return;
    await this.persist_tag_colors(next);
  }

  async clear_tag_color(tag: string) {
    const next = without_tag_color(this.store.tag_colors, tag);
    if (next === this.store.tag_colors) return;
    await this.persist_tag_colors(next);
  }

  private async persist_tag_colors(next: Record<string, string>) {
    const vault = this.vault_store.vault;
    if (!vault || !this.vault_settings_port) return;
    this.store.set_tag_colors(next);
    try {
      await this.vault_settings_port.set_vault_setting(
        vault.id,
        TAG_COLORS_SETTING_KEY,
        next,
      );
    } catch (e) {
      this.store.set_error(e instanceof Error ? e.message : String(e));
    }
  }

  deselect_tag() {
    this.store.select_tag(null);
    this.store.set_notes_for_tag([]);
  }

  async select_tag(tag: string) {
    await this.load_notes(tag, false, () =>
      this.port.get_notes_for_tag(this.vault_store.vault!.id, tag),
    );
  }

  async select_tag_prefix(tag: string) {
    await this.load_notes(tag, true, () =>
      this.port.get_notes_for_tag_prefix(this.vault_store.vault!.id, tag),
    );
  }

  private async load_notes(
    tag: string,
    is_prefix: boolean,
    fetch_fn: () => Promise<string[]>,
  ) {
    const vault = this.vault_store.vault;
    if (!vault) return;

    this.store.select_tag(tag, is_prefix);
    this.store.set_notes_for_tag([]);
    this.store.set_notes_loading(true);
    try {
      const notes = await fetch_fn();
      this.store.set_notes_for_tag(notes);
    } catch (e) {
      this.store.set_error(e instanceof Error ? e.message : String(e));
    } finally {
      this.store.set_notes_loading(false);
    }
  }
}
