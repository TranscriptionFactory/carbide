import type { CommandContext } from "$lib/features/search/types/command_context";
import type { EditorStore } from "$lib/features/editor/state/editor_store.svelte";
import type { GitStore } from "$lib/features/git/state/git_store.svelte";
import type { AiStore } from "$lib/features/ai/state/ai_store.svelte";
import type { UIStore } from "$lib/app/orchestration/ui_store.svelte";
import type { TabStore } from "$lib/features/tab/state/tab_store.svelte";

type ContextStores = {
  editor: EditorStore;
  tab: TabStore;
  git: GitStore;
  ai: AiStore;
  ui: UIStore;
};

export function build_command_context(stores: ContextStores): CommandContext {
  const open_note = stores.editor.open_note;
  const note_path = open_note?.meta.path ?? "";
  const active_tab = stores.tab.active_tab;

  return {
    has_open_note: open_note !== null && active_tab?.kind === "note",
    has_git_repo: stores.git.enabled,
    has_git_remote: stores.git.has_remote,
    has_ai_cli: stores.ai.dialog.cli_status === "available",
    is_split_view: stores.editor.split_view,
    has_selection:
      stores.editor.selection !== null &&
      stores.editor.selection.text.trim().length > 0,
    is_canvas_file: note_path.endsWith(".canvas"),
    is_excalidraw_file: note_path.endsWith(".excalidraw"),
    is_html_document:
      active_tab?.kind === "document" && active_tab.file_type === "html",
  };
}
