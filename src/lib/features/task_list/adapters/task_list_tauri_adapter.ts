import { invoke } from "@tauri-apps/api/core";
import type { TaskListPort } from "../ports";
import type { TaskList } from "../types";
import type { VaultId } from "$lib/shared/types/ids";

export function create_task_list_tauri_adapter(): TaskListPort {
  return {
    async list_task_lists(vault_id: VaultId): Promise<string[]> {
      return invoke("task_list_list", { vaultId: vault_id });
    },
    async read_task_list(vault_id: VaultId, name: string): Promise<TaskList> {
      return invoke("task_list_read", { vaultId: vault_id, name });
    },
    async write_task_list(
      vault_id: VaultId,
      name: string,
      data: TaskList,
    ): Promise<void> {
      return invoke("task_list_write", { vaultId: vault_id, name, data });
    },
    async delete_task_list(vault_id: VaultId, name: string): Promise<void> {
      return invoke("task_list_delete", { vaultId: vault_id, name });
    },
  };
}
