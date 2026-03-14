export type HostMessage =
  | { type: "init_scene"; scene: ExcalidrawScene }
  | {
      type: "update_scene";
      elements: unknown[];
      appState: Record<string, unknown>;
    }
  | { type: "get_scene" }
  | { type: "theme_sync"; theme: "light" | "dark" };

export type GuestMessage =
  | {
      type: "on_change";
      elements: unknown[];
      appState: Record<string, unknown>;
      dirty: boolean;
    }
  | { type: "scene_response"; scene: ExcalidrawScene }
  | { type: "ready" };

export type ExcalidrawScene = {
  type?: string;
  version?: number;
  source?: string;
  elements: unknown[];
  appState?: Record<string, unknown>;
  files?: Record<string, unknown>;
};

export function post_to_host(message: GuestMessage) {
  window.parent.postMessage(message, "*");
}
