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
import {
  resolve_iwe_ai_provider,
  is_output_file_provider,
} from "$lib/features/marksman/domain/iwe_provider_resolution";

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

export function to_transform_action_id(name: string): string {
  return `iwe.transform.${name}`;
}

export interface IweActionDeps {
  registry: ActionRegistry;
  editor_store: EditorStore;
  marksman_store: MarksmanStore;
  marksman_service: MarksmanService;
  ui_store: UIStore;
  workspace_edit_deps: WorkspaceEditDeps;
  command_sink?: {
    register(cmd: {
      id: string;
      label: string;
      description: string;
      keywords: string[];
      icon: string;
    }): void;
    unregister(id: string): void;
  };
}

function make_structural_executor(deps: IweActionDeps) {
  return async function execute_iwe_action(action_id: string): Promise<void> {
    const {
      marksman_store,
      ui_store,
      editor_store,
      marksman_service,
      workspace_edit_deps,
    } = deps;
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
  };
}

function make_transform_executor(deps: IweActionDeps) {
  return async function execute_transform(action_name: string): Promise<void> {
    const {
      marksman_store,
      ui_store,
      editor_store,
      marksman_service,
      workspace_edit_deps,
    } = deps;
    if (marksman_store.status !== "running") return;
    if (ui_store.editor_settings.markdown_lsp_provider !== "iwes") return;

    const open_note = editor_store.open_note;
    const cursor = editor_store.cursor;
    if (!open_note || !cursor) return;

    const kind = `custom.${action_name}`;
    const line = cursor.line - 1;
    const character = cursor.column - 1;

    const actions = await marksman_service.fetch_code_actions(
      open_note.meta.path,
      line,
      character,
      line,
      character,
    );

    const chosen = actions.find((a) => a.kind?.startsWith(kind));
    if (!chosen) return;

    const result = await marksman_service.code_action_resolve(chosen.raw_json);
    if (result) {
      await apply_workspace_edit_result(result, workspace_edit_deps);
    }
  };
}

export function register_iwe_actions(deps: IweActionDeps): void {
  const { registry, marksman_service } = deps;
  const execute_iwe_action = make_structural_executor(deps);
  const execute_transform = make_transform_executor(deps);

  const structural_commands: Array<{ id: string; label: string }> = [
    { id: ACTION_IDS.iwe_extract_section, label: "IWE: Extract Section" },
    { id: ACTION_IDS.iwe_extract_all, label: "IWE: Extract All Subsections" },
    { id: ACTION_IDS.iwe_inline_section, label: "IWE: Inline as Section" },
    { id: ACTION_IDS.iwe_inline_quote, label: "IWE: Inline as Quote" },
    { id: ACTION_IDS.iwe_list_to_sections, label: "IWE: List to Sections" },
    { id: ACTION_IDS.iwe_section_to_list, label: "IWE: Section to List" },
    { id: ACTION_IDS.iwe_sort_list, label: "IWE: Sort List" },
    { id: ACTION_IDS.iwe_create_link, label: "IWE: Create Link" },
  ];

  for (const cmd of structural_commands) {
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
      const ok = await marksman_service.iwe_config_reset();
      if (!ok) return;
      const provider = resolve_iwe_ai_provider(deps.ui_store.editor_settings);
      if (provider && !is_output_file_provider(provider)) {
        await marksman_service.rewrite_provider_and_restart(provider);
      }
    },
  });

  registry.register({
    id: ACTION_IDS.iwe_refresh_transforms,
    label: "IWE: Refresh Transforms",
    execute: () => refresh_iwe_transforms(deps, execute_transform),
  });
}

export async function refresh_iwe_transforms(
  deps: IweActionDeps,
  execute_transform?: (name: string) => Promise<void>,
): Promise<void> {
  const { registry, marksman_store, marksman_service, command_sink } = deps;
  const executor = execute_transform ?? make_transform_executor(deps);

  const previous = marksman_store.transform_actions;
  if (command_sink) {
    for (const action of previous) {
      command_sink.unregister(to_transform_action_id(action.name));
    }
  }

  const status = await marksman_service.iwe_config_status();
  if (!status?.exists) {
    marksman_store.set_transform_actions([]);
    return;
  }

  const transforms = status.actions.filter(
    (a) => a.action_type === "transform",
  );
  marksman_store.set_transform_actions(transforms);

  for (const action of transforms) {
    const action_id = to_transform_action_id(action.name);
    registry.register({
      id: action_id,
      label: `IWE: ${action.title}`,
      execute: () => executor(action.name),
    });
    if (command_sink) {
      command_sink.register({
        id: action_id,
        label: `IWE: ${action.title}`,
        description: `Run "${action.title}" transform on the block at cursor`,
        keywords: ["iwe", "transform", action.name, action.title.toLowerCase()],
        icon: "sparkles",
      });
    }
  }
}
