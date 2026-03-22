import type { CanvasPort } from "$lib/features/canvas/ports";
import type {
  CanvasStore,
  ExcalidrawScene,
} from "$lib/features/canvas/state/canvas_store.svelte";
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

  async open_canvas(
    tab_id: string,
    file_path: string,
    file_type: "canvas" | "excalidraw" = "canvas",
  ): Promise<void> {
    const vault_id = this.vault_store.vault?.id;
    if (!vault_id) return;

    this.canvas_store.init_state(tab_id, file_path, file_type);
    this.canvas_store.set_status(tab_id, "loading");

    try {
      const [content, camera] = await Promise.all([
        this.canvas_port.read_file(vault_id, file_path),
        this.canvas_port.read_camera(vault_id, file_path),
      ]);

      if (file_type === "excalidraw") {
        const scene = JSON.parse(content) as ExcalidrawScene;
        this.canvas_store.set_excalidraw_scene(tab_id, scene);
      } else {
        const result = parse_canvas(content);
        if (!result.ok) {
          this.canvas_store.set_status(tab_id, "error", result.error);
          return;
        }
        this.canvas_store.set_canvas_data(tab_id, result.data);
      }

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
    if (!state) return;

    try {
      let content: string;
      if (state.file_type === "excalidraw") {
        const provider = this.canvas_store.get_scene_provider(tab_id);
        const scene = provider ? await provider() : state.excalidraw_scene;
        if (!scene) return;
        if (provider) {
          this.canvas_store.set_excalidraw_scene(tab_id, scene);
        }
        content = JSON.stringify(scene, null, 2);
      } else if (state.canvas_data) {
        content = serialize_canvas(state.canvas_data);
      } else {
        return;
      }

      await this.canvas_port.write_file(vault_id, state.file_path, content);
      this.canvas_store.set_dirty(tab_id, false);

      if (state.file_type === "excalidraw") {
        this.#export_svg_preview(tab_id, vault_id, state.file_path);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to save canvas";
      this.canvas_store.set_status(tab_id, "error", message);
    }
  }

  async save_excalidraw_scene(
    tab_id: string,
    scene: ExcalidrawScene,
  ): Promise<void> {
    this.canvas_store.set_excalidraw_scene(tab_id, scene);
    this.canvas_store.set_dirty(tab_id, true);
    await this.save_canvas(tab_id);
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

  async read_svg_preview(file_path: string): Promise<string | null> {
    const vault_id = this.vault_store.vault?.id;
    if (!vault_id) return null;
    return this.canvas_port.read_svg_preview(vault_id, file_path);
  }

  async repair_canvas_refs(
    vault_id: string,
    old_path: string,
    new_path: string,
  ): Promise<void> {
    await this.canvas_port.rewrite_refs_for_rename(
      vault_id,
      old_path,
      new_path,
    );
  }

  async #export_svg_preview(
    tab_id: string,
    vault_id: string,
    file_path: string,
  ): Promise<void> {
    const provider = this.canvas_store.get_svg_export_provider(tab_id);
    if (!provider) return;
    try {
      const svg = await provider();
      if (svg) {
        await this.canvas_port.write_svg_preview(vault_id, file_path, svg);
      }
    } catch {
      // SVG preview is best-effort; don't fail the save
    }
  }
}
