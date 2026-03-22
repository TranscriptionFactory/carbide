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

    async rewrite_refs_for_rename(
      vault_id: string,
      old_path: string,
      new_path: string,
    ): Promise<number> {
      return invoke<number>("rewrite_canvas_refs_for_rename", {
        vaultId: vault_id,
        oldPath: old_path,
        newPath: new_path,
      });
    },

    async read_svg_preview(
      vault_id: string,
      canvas_path: string,
    ): Promise<string | null> {
      const preview_path = svg_preview_path(canvas_path);
      try {
        return await invoke<string>("read_vault_file", {
          vaultId: vault_id,
          relativePath: preview_path,
        });
      } catch {
        return null;
      }
    },

    async write_svg_preview(
      vault_id: string,
      canvas_path: string,
      svg: string,
    ): Promise<void> {
      const preview_path = svg_preview_path(canvas_path);
      return invoke("write_vault_file", {
        vaultId: vault_id,
        relativePath: preview_path,
        content: svg,
      });
    },
  };
}

function svg_preview_path(canvas_path: string): string {
  const filename = canvas_path.replace(/\//g, "__");
  return `.carbide/excalidraw_previews/${filename}.svg`;
}
