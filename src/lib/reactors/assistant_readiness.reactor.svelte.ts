import type { VaultStore } from "$lib/features/vault";
import type {
  AssistantChatService,
  AssistantChatStore,
} from "$lib/features/assistant";
import type { BasesStore } from "$lib/features/bases";
import type { ActionRegistry } from "$lib/app/action_registry/action_registry";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";

const READINESS_POLL_MS = 5000;

export function create_assistant_readiness_reactor(
  chat_store: AssistantChatStore,
  chat_service: AssistantChatService,
  vault_store: VaultStore,
  bases_store: BasesStore,
  action_registry: ActionRegistry,
  poll_ms: number = READINESS_POLL_MS,
): () => void {
  let listed_views_for: string | null = null;

  return $effect.root(() => {
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
      void chat_store.provider_id;
      chat_store.set_readiness({ state: "checking" });
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
