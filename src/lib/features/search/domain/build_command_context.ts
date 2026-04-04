import type { CommandContext } from "$lib/features/search/types/command_context";
import type { EditorStore } from "$lib/features/editor";
import type { GitStore } from "$lib/features/git";
import type { AiStore } from "$lib/features/ai";

type ContextStores = {
  editor: EditorStore;
  git: GitStore;
  ai?: Pick<AiStore, "dialog">;
};

export function build_command_context(stores: ContextStores): CommandContext {
  const open_note = stores.editor.open_note;
  const note_path = open_note?.meta.path ?? "";

  return {
    has_open_note: open_note !== null,
    has_git_repo: stores.git.enabled,
    has_git_remote: stores.git.has_remote,
    has_ai_cli: stores.ai?.dialog.cli_status === "available",
    is_split_view: stores.editor.split_view,
    has_selection:
      stores.editor.selection !== null &&
      stores.editor.selection.text.trim().length > 0,
    is_canvas_file: note_path.endsWith(".canvas"),
    is_excalidraw_file: note_path.endsWith(".excalidraw"),
  };
}
