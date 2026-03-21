import type { ActionRegistrationInput } from "$lib/app/action_registry/action_registration_input";
import {
  as_note_path,
  type NoteId,
  type NotePath,
} from "$lib/shared/types/ids";
import type { PastedImagePayload } from "$lib/shared/types/editor";
import { sanitize_note_name } from "$lib/features/note/domain/sanitize_note_name";
import { to_markdown_asset_target } from "$lib/features/note/domain/asset_markdown_path";
import { format_note_name } from "$lib/features/note/domain/format_note_name";
import { detect_file_type } from "$lib/features/document";

export function close_delete_dialog(input: ActionRegistrationInput) {
  input.stores.ui.delete_note_dialog = {
    open: false,
    note: null,
  };
}

export function close_rename_dialog(input: ActionRegistrationInput) {
  input.stores.ui.rename_note_dialog = {
    open: false,
    note: null,
    new_name: "",
    show_overwrite_confirm: false,
    is_checking_conflict: false,
  };
}

export function close_save_dialog(input: ActionRegistrationInput) {
  input.stores.ui.save_note_dialog = {
    open: false,
    folder_path: "",
    new_path: null,
    show_overwrite_confirm: false,
    is_checking_existence: false,
    source: "manual",
  };
}

export function close_image_paste_dialog(input: ActionRegistrationInput) {
  input.stores.ui.image_paste_dialog = {
    open: false,
    note_id: null,
    note_path: null,
    image: null,
    filename: "",
    estimated_size_bytes: 0,
    target_folder: "",
  };
}

export function build_full_path(
  folder_path: string,
  filename: string,
): NotePath {
  const sanitized = sanitize_note_name(filename);
  return as_note_path(folder_path ? `${folder_path}/${sanitized}` : sanitized);
}

export function filename_from_path(path: string): string {
  const last_slash = path.lastIndexOf("/");
  return last_slash >= 0 ? path.slice(last_slash + 1) : path;
}

export function build_note_path_from_name(
  parent: string,
  name: string,
): NotePath {
  const filename = `${name}.md`;
  return as_note_path(parent ? `${parent}/${filename}` : filename);
}

export function image_alt_text(file_name: string | null): string {
  if (!file_name) return "image";
  const leaf = file_name.split("/").filter(Boolean).at(-1) ?? "";
  const stem = leaf.replace(/\.[^.]+$/i, "").trim();
  return stem !== "" ? stem : "image";
}

type AttachmentSaveOptions = {
  custom_filename?: string;
  attachment_folder?: string;
};

const DEFAULT_ATTACHMENT_NAME_TEMPLATE = "%Y-%m-%d_%H%M";

export function build_default_attachment_name(now: Date): string {
  return format_note_name(DEFAULT_ATTACHMENT_NAME_TEMPLATE, now);
}

function resolve_attachment_save_options(
  options?: AttachmentSaveOptions,
): Required<Pick<AttachmentSaveOptions, "custom_filename">> &
  Pick<AttachmentSaveOptions, "attachment_folder"> {
  const custom_filename = options?.custom_filename?.trim();
  return {
    ...(options?.attachment_folder
      ? { attachment_folder: options.attachment_folder }
      : {}),
    custom_filename:
      custom_filename && custom_filename.length > 0
        ? custom_filename
        : build_default_attachment_name(new Date(Date.now())),
  };
}

export function parse_note_open_input(input: unknown): {
  note_path: string;
  cleanup_if_missing: boolean;
} {
  if (input && typeof input === "object" && "note_path" in input) {
    const record = input as Record<string, unknown>;
    if (typeof record.note_path === "string") {
      return {
        note_path: record.note_path,
        cleanup_if_missing: record.cleanup_if_missing === true,
      };
    }
  }

  return {
    note_path: String(input),
    cleanup_if_missing: false,
  };
}

const EMBEDDABLE_EXTENSIONS = new Set([
  "pdf",
  "mp3",
  "wav",
  "m4a",
  "ogg",
  "flac",
  "mp4",
  "webm",
  "ogv",
  "mkv",
]);

function file_extension(file_name: string | null): string {
  if (!file_name) return "";
  const dot = file_name.lastIndexOf(".");
  return dot >= 0 ? file_name.slice(dot + 1).toLowerCase() : "";
}

export async function save_and_insert_file(
  input: ActionRegistrationInput,
  note_id: NoteId,
  note_path: NotePath,
  file: PastedImagePayload,
  options?: AttachmentSaveOptions,
): Promise<void> {
  const { stores, services } = input;

  const write_result = await services.note.save_pasted_image(
    note_path,
    file,
    resolve_attachment_save_options(options),
  );
  if (write_result.status !== "saved") return;

  const latest_open_note = stores.editor.open_note;
  if (!latest_open_note || latest_open_note.meta.id !== note_id) return;

  const target = to_markdown_asset_target(note_path, write_result.asset_path);
  const ext = file_extension(file.file_name);

  let syntax: string;
  if (detect_file_type(file.file_name ?? "") === "image") {
    const alt = image_alt_text(file.file_name);
    syntax = `![${alt}](${target})`;
  } else if (EMBEDDABLE_EXTENSIONS.has(ext)) {
    syntax = `![[${target}]]`;
  } else {
    const name = file.file_name ?? "file";
    syntax = `[${name}](${target})`;
  }

  services.editor.insert_text(syntax);
}

export async function save_and_insert_image(
  input: ActionRegistrationInput,
  note_id: NoteId,
  note_path: NotePath,
  image: PastedImagePayload,
  options?: AttachmentSaveOptions,
): Promise<void> {
  const { stores, services } = input;

  const write_result = await services.note.save_pasted_image(
    note_path,
    image,
    resolve_attachment_save_options(options),
  );
  if (write_result.status !== "saved") return;

  const latest_open_note = stores.editor.open_note;
  if (!latest_open_note || latest_open_note.meta.id !== note_id) return;

  const target = to_markdown_asset_target(note_path, write_result.asset_path);
  const alt = image_alt_text(image.file_name);
  services.editor.insert_text(`![${alt}](${target})`);
}
