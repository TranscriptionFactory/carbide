<script lang="ts">
  import { VaultDashboardPanel } from "$lib/features/vault";
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import { ACTION_IDS } from "$lib/app";

  const { stores, action_registry } = use_app_context();

  const dashboard_task_counts = $derived.by(() => {
    const tasks = stores.task.tasks;
    if (tasks.length === 0) return null;
    let todo = 0,
      doing = 0,
      done = 0;
    for (const t of tasks) {
      if (t.status === "todo") todo++;
      else if (t.status === "doing") doing++;
      else if (t.status === "done") done++;
    }
    return { todo, doing, done };
  });
</script>

<VaultDashboardPanel
  stats_status={stores.notes.dashboard_stats.status}
  note_count={stores.notes.dashboard_stats.value?.note_count ?? null}
  folder_count={stores.notes.dashboard_stats.value?.folder_count ?? null}
  recent_notes={stores.notes.recent_notes}
  vault_name={stores.vault.vault?.name ?? ""}
  vault_path={stores.vault.vault?.path ?? ""}
  on_note_click={(note_path: string) =>
    void action_registry.execute(ACTION_IDS.note_open, note_path)}
  on_new_note={() => void action_registry.execute(ACTION_IDS.note_create)}
  on_search={() => void action_registry.execute(ACTION_IDS.omnibar_open)}
  on_reindex={() => void action_registry.execute(ACTION_IDS.vault_reindex)}
  task_counts={dashboard_task_counts}
  git_enabled={stores.git.enabled}
  git_branch={stores.git.branch}
  git_is_dirty={stores.git.is_dirty}
  git_pending_files={stores.git.pending_files}
  tags={stores.tag.tags}
  on_tag_click={(tag: string) =>
    void action_registry.execute(ACTION_IDS.tags_select, tag)}
/>
