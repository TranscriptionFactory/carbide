import { invoke } from "@tauri-apps/api/core";
import { APP_DIR } from "$lib/shared/constants/special_folders";
import type { AiHistoryPersistencePort } from "$lib/features/ai/ports";
import type { AiConversationTurn } from "$lib/features/ai/domain/ai_types";

const HISTORY_PATH = `${APP_DIR}/ai/history.json`;

export const AI_HISTORY_TURN_CAP = 100;

export function create_ai_history_tauri_adapter(): AiHistoryPersistencePort {
  return {
    async load_history(vault_id) {
      try {
        const content = await invoke<string>("read_vault_file", {
          vaultId: vault_id,
          relativePath: HISTORY_PATH,
        });
        const parsed = JSON.parse(content) as unknown;
        return Array.isArray(parsed) ? (parsed as AiConversationTurn[]) : [];
      } catch {
        return [];
      }
    },

    async save_history(vault_id, turns) {
      await invoke("write_vault_file", {
        vaultId: vault_id,
        relativePath: HISTORY_PATH,
        content: JSON.stringify(turns.slice(-AI_HISTORY_TURN_CAP), null, 2),
      });
    },
  };
}
