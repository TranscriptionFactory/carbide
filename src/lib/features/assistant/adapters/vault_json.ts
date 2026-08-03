import { invoke } from "@tauri-apps/api/core";

export async function read_json<T>(
  vault_id: string,
  relative_path: string,
): Promise<T | null> {
  try {
    const content = await invoke<string>("read_vault_file", {
      vaultId: vault_id,
      relativePath: relative_path,
    });
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

export async function write_json(
  vault_id: string,
  relative_path: string,
  value: unknown,
): Promise<void> {
  await invoke("write_vault_file", {
    vaultId: vault_id,
    relativePath: relative_path,
    content: JSON.stringify(value, null, 2),
  });
}
