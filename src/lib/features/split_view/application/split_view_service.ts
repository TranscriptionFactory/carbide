import { EditorService, EditorStore } from "$lib/features/editor";
import type { EditorPort, EditorServiceCallbacks } from "$lib/features/editor";
import type { VaultStore } from "$lib/features/vault";
import type { VaultSettingsPort } from "$lib/features/vault";
import type { OpStore } from "$lib/app";
import type { SplitViewStore } from "$lib/features/split_view/state/split_view_store.svelte";
import type { OpenNoteState } from "$lib/shared/types/editor";
import { create_logger } from "$lib/shared/utils/logger";
import type { NotePath } from "$lib/shared/types/ids";

const log = create_logger("split_view_service");

const SPLIT_VIEW_KEY = "split_view_state";

type PersistedSplitState = {
  note_path: string;
};

export class SplitViewService {
  private secondary_editor: EditorService | null = null;
  private secondary_store: EditorStore | null = null;

  constructor(
    private readonly editor_port: EditorPort,
    private readonly vault_store: VaultStore,
    private readonly op_store: OpStore,
    private readonly split_view_store: SplitViewStore,
    private readonly callbacks: EditorServiceCallbacks,
    private readonly vault_settings_port?: VaultSettingsPort,
  ) {}

  activate(note: OpenNoteState): void {
    this.split_view_store.open_secondary(note);
  }

  async mount_secondary(
    note: OpenNoteState,
    root: HTMLDivElement,
  ): Promise<void> {
    log.info("Mounting secondary editor", { note_id: note.meta.id });

    if (!this.secondary_editor) {
      this.secondary_store = new EditorStore();
      this.secondary_editor = new EditorService(
        this.editor_port,
        this.vault_store,
        this.secondary_store,
        this.op_store,
        this.callbacks,
      );
    }

    this.secondary_store?.set_open_note(note);
    await this.secondary_editor.mount({ root, note });
  }

  unmount_secondary(): void {
    if (this.secondary_editor) {
      this.secondary_editor.unmount();
      this.secondary_editor = null;
    }
    this.secondary_store = null;
  }

  close(): void {
    log.info("Closing split view");
    this.unmount_secondary();
    this.split_view_store.close();
  }

  is_active(): boolean {
    return this.split_view_store.active;
  }

  get_secondary_note_path(): NotePath | null {
    return (
      (this.split_view_store.secondary_note?.meta.path as NotePath) ?? null
    );
  }

  async save_split_state(): Promise<void> {
    if (!this.vault_settings_port) return;
    const vault_id = this.vault_store.vault?.id;
    if (!vault_id) return;

    const note_path = this.get_secondary_note_path();
    const state: PersistedSplitState | null = note_path ? { note_path } : null;

    try {
      await this.vault_settings_port.set_vault_setting(
        vault_id,
        SPLIT_VIEW_KEY,
        state,
      );
    } catch (error) {
      log.error("Save split state failed", { error });
    }
  }

  async load_split_state(): Promise<PersistedSplitState | null> {
    if (!this.vault_settings_port) return null;
    const vault_id = this.vault_store.vault?.id;
    if (!vault_id) return null;

    try {
      return await this.vault_settings_port.get_vault_setting<PersistedSplitState>(
        vault_id,
        SPLIT_VIEW_KEY,
      );
    } catch (error) {
      log.error("Load split state failed", { error });
      return null;
    }
  }

  destroy(): void {
    this.close();
  }
}
