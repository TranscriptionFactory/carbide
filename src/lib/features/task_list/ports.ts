import type { VaultId } from "$lib/shared/types/ids";
import type { TaskList } from "./types";

export interface TaskListPort {
  list_task_lists(vault_id: VaultId): Promise<string[]>;
  read_task_list(vault_id: VaultId, name: string): Promise<TaskList>;
  write_task_list(
    vault_id: VaultId,
    name: string,
    data: TaskList,
  ): Promise<void>;
  delete_task_list(vault_id: VaultId, name: string): Promise<void>;
}
