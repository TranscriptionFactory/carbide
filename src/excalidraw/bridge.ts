export type HostMessage =
  | { type: "init_scene"; scene: ExcalidrawScene }
  | {
      type: "update_scene";
      elements: unknown[];
      appState: Record<string, unknown>;
    }
  | { type: "get_scene" }
  | { type: "export_svg" }
  | {
      type: "theme_sync";
      theme: "light" | "dark";
      viewBackgroundColor: string;
    };

export type GuestMessage =
  | {
      type: "on_change";
      elements: unknown[];
      appState: Record<string, unknown>;
      dirty: boolean;
    }
  | { type: "scene_response"; scene: ExcalidrawScene }
  | { type: "svg_export_response"; svg: string }
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
