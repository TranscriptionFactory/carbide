import { open } from "@tauri-apps/plugin-dialog";
import { as_vault_path, type VaultPath } from "$lib/shared/types/ids";
import { is_mobile_tauri } from "$lib/shared/utils/detect_platform";

export async function choose_vault_directory(): Promise<VaultPath | null> {
  if (is_mobile_tauri) {
    throw new Error("Folder picker is not available on mobile yet.");
  }

  const selected = await open({
    directory: true,
    multiple: false,
  });
  if (!selected) return null;
  if (Array.isArray(selected)) return null;
  return as_vault_path(selected);
}
