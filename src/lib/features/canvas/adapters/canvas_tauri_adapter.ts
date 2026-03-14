import { invoke } from "@tauri-apps/api/core";
import type { CanvasPort } from "$lib/features/canvas/ports";
import type { Camera } from "$lib/features/canvas/types/canvas";

export function create_canvas_tauri_adapter(): CanvasPort {
  return {
    async read_file(vault_id: string, relative_path: string): Promise<string> {
      return invoke<string>("read_vault_file", {
        vaultId: vault_id,
        relativePath: relative_path,
      });
    },

    async write_file(
      vault_id: string,
      relative_path: string,
      content: string,
    ): Promise<void> {
      return invoke("write_vault_file", {
        vaultId: vault_id,
        relativePath: relative_path,
        content,
      });
    },

    async read_camera(
      _vault_id: string,
      _canvas_path: string,
    ): Promise<Camera | null> {
      return null;
    },

    async write_camera(
      _vault_id: string,
      _canvas_path: string,
      _camera: Camera,
    ): Promise<void> {},
  };
}
