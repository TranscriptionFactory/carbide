import type { Camera } from "$lib/features/canvas/types/canvas";

export interface CanvasPort {
  read_file(vault_id: string, relative_path: string): Promise<string>;
  write_file(
    vault_id: string,
    relative_path: string,
    content: string,
  ): Promise<void>;
  read_camera(vault_id: string, canvas_path: string): Promise<Camera | null>;
  write_camera(
    vault_id: string,
    canvas_path: string,
    camera: Camera,
  ): Promise<void>;
  rewrite_refs_for_rename(
    vault_id: string,
    old_path: string,
    new_path: string,
  ): Promise<number>;
}
