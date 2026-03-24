import { Plugin, PluginKey } from "prosemirror-state";
import { editor_context_plugin_key } from "$lib/features/editor/adapters/editor_context_plugin";
import { detect_file_type } from "$lib/features/document";
import { to_markdown_asset_target } from "$lib/features/note";
import { as_note_path, as_asset_path } from "$lib/shared/types/ids";
import type { PastedImagePayload } from "$lib/shared/types/editor";

const FILE_DROP_PLUGIN_KEY = new PluginKey("file-drop");

const MARKDOWN_EXTENSIONS = new Set([".md", ".markdown"]);

function is_markdown_path(path: string): boolean {
  const dot = path.lastIndexOf(".");
  if (dot === -1) return false;
  return MARKDOWN_EXTENSIONS.has(path.slice(dot).toLowerCase());
}

function filename_from_path(path: string): string {
  return path.split("/").at(-1) ?? path;
}

export function build_file_link(
  vault_relative_path: string,
  note_path: string,
): string {
  const filename = filename_from_path(vault_relative_path);
  const dot = filename.lastIndexOf(".");
  const label = dot >= 0 ? filename.slice(0, dot) : filename;

  const target = to_markdown_asset_target(
    as_note_path(note_path),
    as_asset_path(vault_relative_path),
  );

  const file_type = detect_file_type(filename);
  if (file_type === "image") {
    return `![${label}](${target})`;
  }
  return `[${filename}](${target})`;
}

export function create_file_drop_prose_plugin(
  on_external_file_drop?: (payload: PastedImagePayload) => void,
): Plugin {
  return new Plugin({
    key: FILE_DROP_PLUGIN_KEY,
    props: {
      handleDrop(view, event) {
        const editable = view.props.editable?.(view.state);
        if (!editable) return false;

        const dt = event.dataTransfer;
        if (!dt) return false;

        const count_str = dt.getData("application/x-carbide-filetree-count");

        if (!count_str) {
          if (!on_external_file_drop || dt.files.length === 0) return false;

          const files = Array.from(dt.files).filter(
            (f) => f.name && f.size > 0,
          );
          if (files.length === 0) return false;

          event.preventDefault();

          for (const file of files) {
            void file.arrayBuffer().then((buffer) => {
              on_external_file_drop({
                bytes: new Uint8Array(buffer),
                mime_type: file.type || "application/octet-stream",
                file_name: file.name,
              });
            });
          }

          return true;
        }

        const paths_raw = dt.getData("text/plain");
        if (!paths_raw) return false;

        const paths = paths_raw
          .split("\n")
          .map((p) => p.trim())
          .filter(Boolean);

        const non_markdown = paths.filter((p) => !is_markdown_path(p));
        if (non_markdown.length === 0) return false;

        event.preventDefault();

        const context_state = editor_context_plugin_key.getState(view.state);
        const note_path = context_state?.note_path ?? "";

        const links = non_markdown
          .map((p) => build_file_link(p, note_path))
          .join("\n");

        const drop_pos = view.posAtCoords({
          left: event.clientX,
          top: event.clientY,
        });
        const insert_pos = drop_pos
          ? drop_pos.pos
          : view.state.doc.content.size;

        const tr = view.state.tr.insertText(links, insert_pos);
        view.dispatch(tr.scrollIntoView());
        view.focus();

        return true;
      },
    },
  });
}
