import type { NotesPort } from "$lib/features/note/ports";
import type {
  MarkdownText,
  NoteId,
  NotePath,
  VaultId,
} from "$lib/shared/types/ids";
import type { NoteDoc, NoteMeta } from "$lib/shared/types/note";
import type {
  FolderContents,
  FolderStats,
  MoveItem,
  MoveItemResult,
} from "$lib/shared/types/filetree";
import { commands } from "$lib/generated/bindings";
import { is_tauri } from "$lib/shared/utils/detect_platform";

function assert_tauri() {
  if (!is_tauri) {
    throw new Error("Tauri commands called in non-Tauri environment");
  }
}

function unwrap_result<T>(
  result: { status: "ok"; data: T } | { status: "error"; error: string },
): T {
  if (result.status === "ok") {
    return result.data;
  }
  throw new Error(result.error);
}

function to_note_meta(meta: {
  id: string;
  path: string;
  name: string;
  title: string;
  blurb?: string;
  mtime_ms: number;
  ctime_ms?: number;
  size_bytes: number;
  file_type?: string | null;
}): NoteMeta {
  return {
    id: meta.id as NoteId,
    path: meta.path as NotePath,
    name: meta.name,
    title: meta.title,
    blurb: meta.blurb ?? "",
    mtime_ms: meta.mtime_ms,
    ctime_ms: meta.ctime_ms ?? meta.mtime_ms,
    size_bytes: meta.size_bytes,
    file_type: meta.file_type ?? null,
  };
}

export function create_notes_tauri_adapter(): NotesPort {
  return {
    async list_notes(vault_id: VaultId) {
      assert_tauri();
      const result = await commands.listNotes(vault_id);
      return unwrap_result(result).map(to_note_meta);
    },
    async list_folders(vault_id: VaultId) {
      assert_tauri();
      const result = await commands.listFolders(vault_id);
      return unwrap_result(result);
    },
    async read_note(vault_id: VaultId, note_id: NoteId) {
      assert_tauri();
      const result = await commands.readNote(vault_id, note_id);
      const doc = unwrap_result(result);
      return {
        meta: to_note_meta(doc.meta),
        markdown: doc.markdown as MarkdownText,
      };
    },
    async write_note(
      vault_id: VaultId,
      note_id: NoteId,
      markdown: MarkdownText,
      expected_mtime_ms?: number,
    ) {
      assert_tauri();
      const result = await commands.writeNote({
        vault_id,
        note_id,
        markdown,
        expected_mtime_ms: expected_mtime_ms ?? null,
      });
      return unwrap_result(result);
    },
    async write_and_index_note(
      vault_id: VaultId,
      note_id: NoteId,
      markdown: MarkdownText,
      expected_mtime_ms?: number,
    ) {
      assert_tauri();
      const result = await commands.writeAndIndexNote({
        vault_id,
        note_id,
        markdown,
        expected_mtime_ms: expected_mtime_ms ?? null,
      });
      return unwrap_result(result);
    },
    async create_note(
      vault_id: VaultId,
      note_path: NotePath,
      initial_markdown: MarkdownText,
    ) {
      assert_tauri();
      const result = await commands.createNote({
        vault_id,
        note_path,
        initial_markdown,
      });
      return to_note_meta(unwrap_result(result));
    },
    async create_folder(
      vault_id: VaultId,
      parent_path: string,
      folder_name: string,
    ) {
      assert_tauri();
      const result = await commands.createFolder({
        vault_id,
        parent_path,
        folder_name,
      });
      unwrap_result(result);
    },
    async rename_note(vault_id: VaultId, from: NotePath, to: NotePath) {
      assert_tauri();
      const result = await commands.renameNote({
        vault_id,
        from,
        to,
      });
      unwrap_result(result);
    },
    async delete_note(vault_id: VaultId, note_id: NoteId) {
      assert_tauri();
      const result = await commands.deleteNote({
        vault_id,
        note_id,
      });
      unwrap_result(result);
    },
    async list_folder_contents(
      vault_id: VaultId,
      folder_path: string,
      offset: number,
      limit: number,
      show_hidden_files: boolean,
    ): Promise<FolderContents> {
      assert_tauri();
      const result = await commands.listFolderContents(
        vault_id,
        folder_path,
        offset,
        limit,
        show_hidden_files,
      );
      const contents = unwrap_result(result);
      return {
        notes: contents.notes.map(to_note_meta),
        files: contents.files ?? [],
        subfolders: contents.subfolders,
        total_count: contents.total_count,
        has_more: contents.has_more,
      };
    },
    async rename_folder(vault_id: VaultId, from_path: string, to_path: string) {
      assert_tauri();
      const result = await commands.renameFolder({
        vault_id,
        from_path,
        to_path,
      });
      unwrap_result(result);
    },
    async delete_folder(vault_id: VaultId, folder_path: string) {
      assert_tauri();
      const result = await commands.deleteFolder({
        vault_id,
        folder_path,
      });
      unwrap_result(result);
    },
    async get_folder_stats(
      vault_id: VaultId,
      folder_path: string,
    ): Promise<FolderStats> {
      assert_tauri();
      const result = await commands.getFolderStats(vault_id, folder_path);
      return unwrap_result(result);
    },
    async move_items(
      vault_id: VaultId,
      items: MoveItem[],
      target_folder: string,
      overwrite: boolean,
    ): Promise<MoveItemResult[]> {
      assert_tauri();
      const result = await commands.moveItems({
        vault_id,
        items,
        target_folder,
        overwrite,
      });
      return unwrap_result(result);
    },
  };
}
