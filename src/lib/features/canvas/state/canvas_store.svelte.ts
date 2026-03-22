import type { Camera, CanvasData } from "$lib/features/canvas/types/canvas";

export type ExcalidrawScene = {
  type?: string;
  version?: number;
  source?: string;
  elements: unknown[];
  appState?: Record<string, unknown>;
  files?: Record<string, unknown>;
};

export type CanvasTabState = {
  tab_id: string;
  file_path: string;
  file_type: "canvas" | "excalidraw";
  canvas_data: CanvasData | null;
  excalidraw_scene: ExcalidrawScene | null;
  camera: Camera;
  is_dirty: boolean;
  status: "idle" | "loading" | "ready" | "error";
  error_message: string | null;
};

export class CanvasStore {
  states = $state<Map<string, CanvasTabState>>(new Map());
  #scene_providers = new Map<string, () => Promise<ExcalidrawScene>>();
  #svg_export_providers = new Map<string, () => Promise<string>>();

  register_scene_provider(
    tab_id: string,
    provider: () => Promise<ExcalidrawScene>,
  ): void {
    this.#scene_providers.set(tab_id, provider);
  }

  unregister_scene_provider(tab_id: string): void {
    this.#scene_providers.delete(tab_id);
  }

  get_scene_provider(
    tab_id: string,
  ): (() => Promise<ExcalidrawScene>) | undefined {
    return this.#scene_providers.get(tab_id);
  }

  register_svg_export_provider(
    tab_id: string,
    provider: () => Promise<string>,
  ): void {
    this.#svg_export_providers.set(tab_id, provider);
  }

  unregister_svg_export_provider(tab_id: string): void {
    this.#svg_export_providers.delete(tab_id);
  }

  get_svg_export_provider(tab_id: string): (() => Promise<string>) | undefined {
    return this.#svg_export_providers.get(tab_id);
  }

  get_state(tab_id: string): CanvasTabState | undefined {
    return this.states.get(tab_id);
  }

  set_state(tab_id: string, state: CanvasTabState): void {
    this.states = new Map(this.states).set(tab_id, state);
  }

  remove_state(tab_id: string): void {
    const next = new Map(this.states);
    next.delete(tab_id);
    this.states = next;
  }

  init_state(
    tab_id: string,
    file_path: string,
    file_type: "canvas" | "excalidraw" = "canvas",
  ): void {
    if (this.states.has(tab_id)) return;
    this.set_state(tab_id, {
      tab_id,
      file_path,
      file_type,
      canvas_data: null,
      excalidraw_scene: null,
      camera: { x: 0, y: 0, zoom: 1 },
      is_dirty: false,
      status: "idle",
      error_message: null,
    });
  }

  set_canvas_data(tab_id: string, data: CanvasData): void {
    this.#patch(tab_id, {
      canvas_data: data,
      status: "ready",
      error_message: null,
    });
  }

  set_excalidraw_scene(tab_id: string, scene: ExcalidrawScene): void {
    this.#patch(tab_id, {
      excalidraw_scene: scene,
      status: "ready",
      error_message: null,
    });
  }

  set_camera(tab_id: string, camera: Camera): void {
    this.#patch(tab_id, { camera });
  }

  set_dirty(tab_id: string, dirty: boolean): void {
    this.#patch(tab_id, { is_dirty: dirty });
  }

  set_status(
    tab_id: string,
    status: CanvasTabState["status"],
    error_message: string | null = null,
  ): void {
    this.#patch(tab_id, { status, error_message });
  }

  update_node(
    tab_id: string,
    node_id: string,
    fields: Record<string, unknown>,
  ): void {
    const state = this.states.get(tab_id);
    if (!state?.canvas_data) return;
    const nodes = state.canvas_data.nodes.map((n) =>
      n.id === node_id ? { ...n, ...fields } : n,
    );
    this.set_state(tab_id, {
      ...state,
      canvas_data: { ...state.canvas_data, nodes },
      is_dirty: true,
    });
  }

  add_node(tab_id: string, node: CanvasData["nodes"][number]): void {
    const state = this.states.get(tab_id);
    if (!state?.canvas_data) return;
    this.set_state(tab_id, {
      ...state,
      canvas_data: {
        ...state.canvas_data,
        nodes: [...state.canvas_data.nodes, node],
      },
      is_dirty: true,
    });
  }

  remove_node(tab_id: string, node_id: string): void {
    const state = this.states.get(tab_id);
    if (!state?.canvas_data) return;
    this.set_state(tab_id, {
      ...state,
      canvas_data: {
        ...state.canvas_data,
        nodes: state.canvas_data.nodes.filter((n) => n.id !== node_id),
        edges: state.canvas_data.edges.filter(
          (e) => e.fromNode !== node_id && e.toNode !== node_id,
        ),
      },
      is_dirty: true,
    });
  }

  add_edge(tab_id: string, edge: CanvasData["edges"][number]): void {
    const state = this.states.get(tab_id);
    if (!state?.canvas_data) return;
    this.set_state(tab_id, {
      ...state,
      canvas_data: {
        ...state.canvas_data,
        edges: [...state.canvas_data.edges, edge],
      },
      is_dirty: true,
    });
  }

  remove_edge(tab_id: string, edge_id: string): void {
    const state = this.states.get(tab_id);
    if (!state?.canvas_data) return;
    this.set_state(tab_id, {
      ...state,
      canvas_data: {
        ...state.canvas_data,
        edges: state.canvas_data.edges.filter((e) => e.id !== edge_id),
      },
      is_dirty: true,
    });
  }

  #patch(tab_id: string, fields: Partial<CanvasTabState>): void {
    const state = this.states.get(tab_id);
    if (!state) return;
    this.states = new Map(this.states).set(tab_id, { ...state, ...fields });
  }
}
