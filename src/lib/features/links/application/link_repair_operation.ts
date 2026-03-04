import type {
  LinkRepairResult,
  LinkRepairService,
} from "$lib/features/links/application/link_repair_service";
import type { VaultId } from "$lib/shared/types/ids";

export function build_link_repair_success_message(
  result: LinkRepairResult,
): string {
  if (result.scanned === 0) {
    return "Link repair complete: no notes scanned";
  }
  return `Link repair complete: ${String(result.rewritten)}/${String(result.scanned)} notes updated`;
}

export function build_link_repair_failed_message(failed_count: number): string {
  return `Link repair failed for ${String(failed_count)} notes`;
}

export async function run_link_repair_operation(input: {
  link_repair: LinkRepairService | null;
  vault_id: VaultId;
  path_map: Map<string, string>;
  on_start: () => void;
  on_success: (message: string) => void;
  on_failed: (message: string) => void;
  on_error: (error: unknown) => void;
}): Promise<void> {
  const {
    link_repair,
    vault_id,
    path_map,
    on_start,
    on_success,
    on_failed,
    on_error,
  } = input;

  if (!link_repair || path_map.size === 0) {
    return;
  }

  on_start();

  try {
    const result = await link_repair.repair_links(vault_id, path_map);
    if (result.failed.length > 0) {
      on_failed(build_link_repair_failed_message(result.failed.length));
      return;
    }

    on_success(build_link_repair_success_message(result));
  } catch (error) {
    on_error(error);
  }
}
