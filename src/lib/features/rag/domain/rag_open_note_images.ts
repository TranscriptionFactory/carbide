import { parse_mentions } from "$lib/features/rag/domain/rag_mentions";
import {
  normalize_folder_scope,
  path_in_folder,
} from "$lib/features/rag/domain/rag_scope";
import type { RagScope } from "$lib/features/rag/domain/rag_types";

function note_basename(note_path: string): string {
  const name = note_path.split("/").pop() ?? note_path;
  return name.replace(/\.[^.]+$/, "");
}

// Tag/base scope membership needs async lookups, so only folder scopes count
// as "in scope" here; @mentioning the note is the explicit escape hatch.
export function should_attach_open_note_images(input: {
  question: string;
  scope: RagScope;
  note_path: string;
  note_title: string;
}): boolean {
  const { mentions } = parse_mentions(input.question);
  const referenced = new Set(
    [input.note_title, note_basename(input.note_path), input.note_path].map(
      (name) => name.toLowerCase(),
    ),
  );
  if (mentions.some((mention) => referenced.has(mention.toLowerCase()))) {
    return true;
  }

  const folders = (input.scope.folders ?? [])
    .map(normalize_folder_scope)
    .filter((f): f is string => f !== null);
  return folders.some((folder) => path_in_folder(input.note_path, folder));
}
