import type { CanvasPort } from "$lib/features/canvas/ports";
import type { CanvasStore } from "$lib/features/canvas/state/canvas_store.svelte";
import type { VaultStore } from "$lib/features/vault";
import type { OpStore } from "$lib/app/orchestration/op_store.svelte";
import {
  parse_canvas,
  serialize_canvas,
} from "$lib/features/canvas/domain/canvas_parser";
import {
  EMPTY_CANVAS,
  EMPTY_EXCALIDRAW_SCENE,
} from "$lib/features/canvas/application/canvas_constants";

export class CanvasService {
  constructor(
    private readonly canvas_port: CanvasPort,
    private readonly vault_store: VaultStore,
    private readonly canvas_store: CanvasStore,
    private readonly op_store: OpStore,
    private readonly now_ms: () => number = () => Date.now(),
  ) {}

  async open_canvas(tab_id: string, file_path: string): Promise<void> {
    const vault_id = this.vault_store.vault?.id;
    if (!vault_id) return;

    this.canvas_store.init_state(tab_id, file_path);
    this.canvas_store.set_status(tab_id, "loading");

    try {
      const content = await this.canvas_port.read_file(vault_id, file_path);
      const result = parse_canvas(content);

      if (!result.ok) {
        this.canvas_store.set_status(tab_id, "error", result.error);
        return;
      }

      this.canvas_store.set_canvas_data(tab_id, result.data);

      const camera = await this.canvas_port.read_camera(vault_id, file_path);
      if (camera) {
        this.canvas_store.set_camera(tab_id, camera);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to load canvas";
      this.canvas_store.set_status(tab_id, "error", message);
    }
  }

  async save_canvas(tab_id: string): Promise<void> {
    const vault_id = this.vault_store.vault?.id;
    if (!vault_id) return;

    const state = this.canvas_store.get_state(tab_id);
    if (!state?.canvas_data) return;

    try {
      const content = serialize_canvas(state.canvas_data);
      await this.canvas_port.write_file(vault_id, state.file_path, content);
      this.canvas_store.set_dirty(tab_id, false);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to save canvas";
      this.canvas_store.set_status(tab_id, "error", message);
    }
  }

  async save_camera(tab_id: string): Promise<void> {
    const vault_id = this.vault_store.vault?.id;
    if (!vault_id) return;

    const state = this.canvas_store.get_state(tab_id);
    if (!state) return;

    await this.canvas_port.write_camera(
      vault_id,
      state.file_path,
      state.camera,
    );
  }

  close_canvas(tab_id: string): void {
    this.canvas_store.remove_state(tab_id);
  }

  async create_canvas(vault_id: string, file_path: string): Promise<void> {
    const content = serialize_canvas(EMPTY_CANVAS);
    await this.canvas_port.write_file(vault_id, file_path, content);
  }

  async create_drawing(vault_id: string, file_path: string): Promise<void> {
    const content = JSON.stringify(EMPTY_EXCALIDRAW_SCENE, null, 2);
    await this.canvas_port.write_file(vault_id, file_path, content);
  }
}
