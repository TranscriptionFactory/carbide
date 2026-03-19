import { EditorService, EditorStore } from "$lib/features/editor";
import type { EditorPort, EditorServiceCallbacks } from "$lib/features/editor";
import type { VaultStore } from "$lib/features/vault";
import type { VaultSettingsPort } from "$lib/features/vault";
import type { OpStore } from "$lib/app";
import type { SplitViewStore } from "$lib/features/split_view/state/split_view_store.svelte";
import type { OpenNoteState } from "$lib/shared/types/editor";
import { create_logger } from "$lib/shared/utils/logger";
import type { NotePath, NoteId } from "$lib/shared/types/ids";
import type { ActivePane } from "$lib/features/split_view/state/split_view_store.svelte";

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

  get_secondary_editor(): EditorService | null {
    return this.secondary_editor;
  }

  get_secondary_editor_store(): EditorStore | null {
    return this.secondary_store;
  }

  get_secondary_open_note(): OpenNoteState | null {
    return (
      this.secondary_store?.open_note ?? this.split_view_store.secondary_note
    );
  }

  sync_secondary_note_state(): void {
    this.split_view_store.set_secondary_note(
      this.secondary_store?.open_note ?? null,
    );
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
    this.sync_secondary_note_state();
    await this.secondary_editor.mount({ root, note });
  }

  unmount_secondary(): void {
    if (this.secondary_editor) {
      this.secondary_editor.unmount();
      this.secondary_editor = null;
    }
    this.secondary_store = null;
    this.sync_secondary_note_state();
  }

  close(): void {
    log.info("Closing split view");
    this.unmount_secondary();
    this.split_view_store.close();
  }

  is_active(): boolean {
    return this.split_view_store.active;
  }

  get_active_pane(): ActivePane {
    return this.split_view_store.active_pane;
  }

  get_secondary_note_path(): NotePath | null {
    return (
      (this.split_view_store.secondary_note?.meta.path as NotePath) ?? null
    );
  }

  is_same_note_in_both_panes(
    primary_note_id: NoteId | null | undefined,
  ): boolean {
    if (!primary_note_id) return false;
    const secondary_note = this.get_secondary_open_note();
    if (!secondary_note) return false;
    return secondary_note.meta.id === primary_note_id;
  }

  propagate_mtime_to_secondary(note_id: NoteId, new_mtime: number): void {
    if (!this.secondary_store) return;
    const secondary_note = this.secondary_store.open_note;
    if (!secondary_note || secondary_note.meta.id !== note_id) return;
    this.secondary_store.update_mtime(note_id, new_mtime);
  }

  async save_split_state(): Promise<void> {
    if (!this.vault_settings_port) return;
    const vault_id = this.vault_store.vault?.id;
    if (!vault_id) return;

    const note_path = this.get_secondary_note_path();
    const state: PersistedSplitState | null = note_path ? { note_path } : null;

    try {
      await this.vault_settings_port.set_local_setting(
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
      return await this.vault_settings_port.get_local_setting<PersistedSplitState>(
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
