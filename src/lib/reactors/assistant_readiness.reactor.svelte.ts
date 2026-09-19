import type { VaultStore } from "$lib/features/vault";
import type {
  AssistantChatService,
  AssistantChatStore,
} from "$lib/features/assistant";
import type { BasesStore } from "$lib/features/bases";
import type { SearchStore } from "$lib/features/search";
import type { ActionRegistry } from "$lib/app/action_registry/action_registry";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";

const READINESS_POLL_MS = 5000;

export function create_assistant_readiness_reactor(
  chat_store: AssistantChatStore,
  chat_service: AssistantChatService,
  vault_store: VaultStore,
  bases_store: BasesStore,
  search_store: SearchStore,
  action_registry: ActionRegistry,
  poll_ms: number = READINESS_POLL_MS,
): () => void {
  let listed_views_for: string | null = null;
  // The work the poll in flight belongs to: a vault or provider change re-arms
  // it, and a bare embedding-progress nudge must not reset the status to
  // "checking" for every batch a pass reports.
  let armed_for: string | null = null;

  return $effect.root(() => {
    // A pass rewrites `embedding_progress` on every batch. Only a status
    // transition (idle → running → completed/failed) is worth re-reading
    // readiness for, and a `$derived` is what collapses the per-batch writes
    // into that: a raw read would re-run the poll below for each batch.
    const embedding_pass_status = $derived(
      search_store.embedding_progress.status,
    );

    $effect(() => {
      const vault_id = vault_store.vault?.id;
      if (!vault_id || vault_id === listed_views_for) return;
      listed_views_for = vault_id;
      if (bases_store.saved_views.length === 0) {
        void action_registry.execute(ACTION_IDS.bases_list_views);
      }
    });

    $effect(() => {
      const vault_id = vault_store.vault?.id;
      // provider changes re-arm the poll alongside vault switches
      const provider_id = chat_store.provider_id;
      // A later attempt must be able to re-arm readiness without a vault or
      // provider switch, so the pass's progress is a dependency here.
      void embedding_pass_status;
      const work = `${vault_id ?? ""}\u0000${provider_id ?? ""}`;
      // A re-arm for the same work keeps the status it already has: reporting
      // "checking" for every progress event would blink the banner away.
      if (work !== armed_for) {
        armed_for = work;
        chat_store.set_readiness({ state: "checking" });
      }
      if (!vault_id) return;
      let cancelled = false;
      let interval: ReturnType<typeof setInterval> | null = null;
      const stop_polling = () => {
        if (interval !== null) {
          clearInterval(interval);
          interval = null;
        }
      };
      // poll only while not ready; ready is stable until vault/provider change
      const refresh = () => {
        void chat_service.check_readiness().then((readiness) => {
          if (cancelled) return;
          chat_store.set_readiness(readiness);
          if (readiness.state === "ready") {
            stop_polling();
          } else if (interval === null) {
            interval = setInterval(refresh, poll_ms);
          }
        });
      };
      refresh();
      return () => {
        cancelled = true;
        stop_polling();
      };
    });
  });
}
