import { EditorService, EditorStore } from "$lib/features/editor";
import type { EditorPort, EditorServiceCallbacks } from "$lib/features/editor";
import type { VaultStore } from "$lib/features/vault";
import type { OpStore } from "$lib/app";
import type { TabStore } from "$lib/features/tab/state/tab_store.svelte";
import type { OpenNoteState } from "$lib/shared/types/editor";
import type { NoteId } from "$lib/shared/types/ids";
import { create_logger } from "$lib/shared/utils/logger";

const log = create_logger("secondary_editor_manager");

export class SecondaryEditorManager {
  private editor: EditorService | null = null;
  private store: EditorStore | null = null;

  constructor(
    private readonly editor_port: EditorPort,
    private readonly vault_store: VaultStore,
    private readonly op_store: OpStore,
    private readonly tab_store: TabStore,
    private readonly callbacks: EditorServiceCallbacks,
  ) {}

  get_editor(): EditorService | null {
    return this.editor;
  }

  get_editor_store(): EditorStore | null {
    return this.store;
  }

  get_open_note(): OpenNoteState | null {
    return this.store?.open_note ?? null;
  }

  is_active(): boolean {
    return this.tab_store.is_split;
  }

  get_active_pane() {
    return this.tab_store.active_pane;
  }

  async mount(note: OpenNoteState, root: HTMLDivElement): Promise<void> {
    if (!this.editor) {
      log.info("Mounting secondary editor", { note_id: note.meta.id });
      this.store = new EditorStore();
      this.editor = new EditorService(
        this.editor_port,
        this.vault_store,
        this.store,
        this.op_store,
        this.callbacks,
      );
      this.store.set_open_note(note);
      await this.editor.mount({ root, note });
      return;
    }

    const current_path = this.store?.open_note?.meta.path;
    if (current_path === note.meta.path) return;

    log.info("Switching secondary editor note", { note_id: note.meta.id });
    this.store?.set_open_note(note);
    await this.editor.mount({ root, note });
  }

  unmount(): void {
    if (this.editor) {
      this.editor.unmount();
      this.editor = null;
    }
    this.store = null;
  }

  propagate_mtime(note_id: NoteId, new_mtime: number): void {
    if (!this.store) return;
    const note = this.store.open_note;
    if (!note || note.meta.id !== note_id) return;
    this.store.update_mtime(note_id, new_mtime);
  }

  destroy(): void {
    this.unmount();
  }
}
