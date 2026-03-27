import type { ActionRegistry } from "$lib/app/action_registry/action_registry";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import type { EditorStore } from "$lib/features/editor";
import type { MarksmanService } from "$lib/features/marksman/application/marksman_service";
import type { MarksmanStore } from "$lib/features/marksman/state/marksman_store.svelte";
import type { UIStore } from "$lib/app/orchestration/ui_store.svelte";
import {
  apply_workspace_edit_result,
  type WorkspaceEditDeps,
} from "$lib/features/lsp";

const IWE_ACTION_KINDS: Record<string, string> = {
  [ACTION_IDS.iwe_extract_section]: "custom.extract",
  [ACTION_IDS.iwe_extract_all]: "custom.extract_all",
  [ACTION_IDS.iwe_inline_section]: "custom.inline",
  [ACTION_IDS.iwe_inline_quote]: "custom.inline",
  [ACTION_IDS.iwe_list_to_sections]: "refactor.rewrite.list.section",
  [ACTION_IDS.iwe_section_to_list]: "refactor.rewrite.section.list",
  [ACTION_IDS.iwe_sort_list]: "custom.sort",
  [ACTION_IDS.iwe_create_link]: "custom.link",
};

export function register_iwe_actions(input: {
  registry: ActionRegistry;
  editor_store: EditorStore;
  marksman_store: MarksmanStore;
  marksman_service: MarksmanService;
  ui_store: UIStore;
  workspace_edit_deps: WorkspaceEditDeps;
}): void {
  const {
    registry,
    editor_store,
    marksman_store,
    marksman_service,
    ui_store,
    workspace_edit_deps,
  } = input;

  async function execute_iwe_action(action_id: string): Promise<void> {
    if (marksman_store.status !== "running") return;
    if (ui_store.editor_settings.markdown_lsp_provider !== "iwes") return;

    const open_note = editor_store.open_note;
    const cursor = editor_store.cursor;
    if (!open_note || !cursor) return;

    const kind = IWE_ACTION_KINDS[action_id];
    if (!kind) return;

    const line = cursor.line - 1;
    const character = cursor.column - 1;

    const actions = await marksman_service.fetch_code_actions(
      open_note.meta.path,
      line,
      character,
      line,
      character,
    );

    const matching = actions.filter((a) => a.kind?.startsWith(kind));
    if (matching.length === 0) return;

    const chosen =
      matching.length === 1
        ? matching[0]
        : (matching.find((a) =>
            a.title
              .toLowerCase()
              .includes(
                action_id.includes("inline_quote") ? "quote" : "section",
              ),
          ) ?? matching[0]);
    if (!chosen) return;

    const result = await marksman_service.code_action_resolve(chosen.raw_json);
    if (result) {
      await apply_workspace_edit_result(result, workspace_edit_deps);
    }
  }

  const iwe_commands: Array<{ id: string; label: string }> = [
    { id: ACTION_IDS.iwe_extract_section, label: "IWE: Extract Section" },
    { id: ACTION_IDS.iwe_extract_all, label: "IWE: Extract All Subsections" },
    { id: ACTION_IDS.iwe_inline_section, label: "IWE: Inline as Section" },
    { id: ACTION_IDS.iwe_inline_quote, label: "IWE: Inline as Quote" },
    { id: ACTION_IDS.iwe_list_to_sections, label: "IWE: List to Sections" },
    { id: ACTION_IDS.iwe_section_to_list, label: "IWE: Section to List" },
    { id: ACTION_IDS.iwe_sort_list, label: "IWE: Sort List" },
    { id: ACTION_IDS.iwe_create_link, label: "IWE: Create Link" },
  ];

  for (const cmd of iwe_commands) {
    registry.register({
      id: cmd.id,
      label: cmd.label,
      execute: () => execute_iwe_action(cmd.id),
    });
  }

  registry.register({
    id: ACTION_IDS.iwe_open_config,
    label: "IWE: Open Config",
    execute: async () => {
      const status = await marksman_service.iwe_config_status();
      if (status?.exists && status.config_url) {
        await registry.execute(ACTION_IDS.shell_open_url, status.config_url);
      }
    },
  });

  registry.register({
    id: ACTION_IDS.iwe_reset_config,
    label: "IWE: Reset Config to Defaults",
    execute: async () => {
      await marksman_service.iwe_config_reset();
    },
  });
}
