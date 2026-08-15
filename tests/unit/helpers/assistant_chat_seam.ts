import { RetrievalService } from "$lib/features/rag";
import {
  AssistantChatService,
  type RetrievalPort,
  type RunStarter,
} from "$lib/features/assistant";
import { VaultStore } from "$lib/features/vault";
import { DEFAULT_EDITOR_SETTINGS } from "$lib/shared/types/editor_settings";
import { create_test_vault } from "./test_fixtures";

// Builds the real C3 seam: the real RetrievalService, wrapped in the same
// object literal create_app_context.ts builds, behind the real chat service.
//
// Deliberately NOT a fake RetrievalPort. A fake would let a suite pass while
// proving only that the code agrees with the fake — the retrieval half (scope
// filtering, pinned resolution, the read bound, citation numbering) would go
// unexercised with every assertion still green.
export function create_chat_seam(input: {
  search: unknown;
  notes: unknown;
  run_starter: RunStarter;
  tag?: unknown;
  bases?: unknown;
  vault_path?: string;
  timeout_seconds?: number;
  // Pass a bare VaultStore to exercise the no-vault path.
  vault_store?: VaultStore;
}): {
  chat: AssistantChatService;
  retrieval_service: RetrievalService;
  retrieval: RetrievalPort;
  vault_store: VaultStore;
} {
  const vault_store = input.vault_store ?? new VaultStore();
  if (!input.vault_store) {
    vault_store.set_vault(
      create_test_vault({ path: (input.vault_path ?? "/vault/demo") as never }),
    );
  }

  const retrieval_service = new RetrievalService(
    input.search as never,
    input.notes as never,
    vault_store,
    (input.tag ?? { get_notes_for_tag: () => Promise.resolve([]) }) as never,
    (input.bases ?? {
      load_view: () => Promise.resolve({}),
      query: () => Promise.resolve({}),
    }) as never,
  );

  const retrieval: RetrievalPort = {
    retrieve: (request) => retrieval_service.retrieve(request),
    check_readiness: () => retrieval_service.check_readiness(),
  };

  return {
    chat: new AssistantChatService(
      retrieval,
      input.run_starter,
      () =>
        input.timeout_seconds ??
        DEFAULT_EDITOR_SETTINGS.ai_execution_timeout_seconds,
    ),
    retrieval_service,
    retrieval,
    vault_store,
  };
}
