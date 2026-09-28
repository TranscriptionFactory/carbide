import React, { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Excalidraw,
  exportToSvg,
  hashElementsVersion,
} from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import type {
  AppState,
  BinaryFiles,
  ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { HostMessage, ExcalidrawScene } from "./bridge";
import { post_to_host } from "./bridge";

type SceneUpdate = Parameters<ExcalidrawImperativeAPI["updateScene"]>[0];
type SceneElements = readonly ExcalidrawElement[];
type SceneAppState = AppState;
type SceneFiles = BinaryFiles;
type ExportSvgOptions = {
  elements: SceneElements;
  appState?: Partial<Omit<SceneAppState, "offsetTop" | "offsetLeft">>;
  files: SceneFiles | null;
  exportPadding?: number;
  skipInliningFonts?: true;
};
type ExportToSvg = (options: ExportSvgOptions) => Promise<SVGSVGElement>;

const export_to_svg = exportToSvg as unknown as ExportToSvg;
const SCENE_CHANGE_DEBOUNCE_MS = 250;

function as_scene_elements(
  elements: ExcalidrawScene["elements"],
): SceneElements {
  return elements as SceneElements;
}

function as_scene_app_state(
  app_state: Record<string, unknown> | undefined,
): Partial<SceneAppState> {
  return (app_state ?? {}) as Partial<SceneAppState>;
}

function as_scene_files(files: ExcalidrawScene["files"]): SceneFiles {
  return (files ?? {}) as SceneFiles;
}

function to_scene_update(input: {
  elements?: ExcalidrawScene["elements"];
  appState?: Record<string, unknown>;
}): SceneUpdate {
  return {
    elements: input.elements ? as_scene_elements(input.elements) : undefined,
    appState: input.appState ? as_scene_app_state(input.appState) : undefined,
  };
}

function content_signature(
  elements: SceneElements,
  files: BinaryFiles,
): string {
  return `${String(hashElementsVersion(elements))}:${String(Object.keys(files).length)}`;
}

function snapshot_scene(
  api: ExcalidrawImperativeAPI | null,
): ExcalidrawScene | null {
  const appState = api?.getAppState();
  if (!api || !appState || appState.isLoading) return null;
  const elements = api.getSceneElements() as SceneElements;
  return {
    type: "excalidraw",
    version: 2,
    source: "carbide",
    elements: structuredClone(elements),
    appState: {
      viewBackgroundColor: appState.viewBackgroundColor,
    },
    files: api.getFiles(),
  };
}

function is_save_shortcut(event: KeyboardEvent): boolean {
  return (
    (event.metaKey || event.ctrlKey) &&
    !event.shiftKey &&
    !event.altKey &&
    event.key.toLowerCase() === "s"
  );
}

function App() {
  const api_ref = useRef<ExcalidrawImperativeAPI | null>(null);
  const [initial_data, set_initial_data] = useState<ExcalidrawScene | null>(
    null,
  );
  const [theme, set_theme] = useState<"light" | "dark">("light");

  useEffect(() => {
    function handle_message(event: MessageEvent<HostMessage>) {
      const msg = event.data;
      if (!msg || typeof msg !== "object" || !("type" in msg)) return;

      switch (msg.type) {
        case "init_scene":
          set_initial_data(msg.scene);
          break;

        case "update_scene":
          api_ref.current?.updateScene(
            to_scene_update({
              elements: msg.elements,
              appState: msg.appState,
            }),
          );
          break;

        case "get_scene":
          post_to_host({
            type: "scene_response",
            scene: snapshot_scene(api_ref.current),
          });
          break;

        case "export_svg": {
          const export_svg = async () => {
            try {
              const elements = (api_ref.current?.getSceneElements() ??
                []) as SceneElements;
              const appState = (api_ref.current?.getAppState() ??
                {}) as ExportSvgOptions["appState"];
              const files = api_ref.current?.getFiles() ?? {};
              const svg_element = await export_to_svg({
                elements,
                appState,
                files,
                exportPadding: 16,
                skipInliningFonts: true,
              });
              post_to_host({
                type: "svg_export_response",
                svg: new XMLSerializer().serializeToString(svg_element),
              });
            } catch {
              post_to_host({ type: "svg_export_response", svg: "" });
            }
          };
          void export_svg();
          break;
        }

        case "theme_sync":
          set_theme(msg.theme);
          if (msg.viewBackgroundColor && api_ref.current) {
            api_ref.current.updateScene(
              to_scene_update({
                appState: {
                  viewBackgroundColor: msg.viewBackgroundColor,
                },
              }),
            );
          }
          break;
      }
    }

    function handle_keydown(event: KeyboardEvent) {
      if (!is_save_shortcut(event)) return;
      event.preventDefault();
      event.stopPropagation();
      post_to_host({ type: "save_requested" });
    }

    window.addEventListener("message", handle_message);
    window.addEventListener("keydown", handle_keydown, true);
    post_to_host({ type: "ready" });

    return () => {
      window.removeEventListener("message", handle_message);
      window.removeEventListener("keydown", handle_keydown, true);
    };
  }, []);

  const last_signature = useRef<string | null>(null);
  const change_timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const on_change = useCallback(
    (
      elements: readonly ExcalidrawElement[],
      _appState: AppState,
      files: BinaryFiles,
    ) => {
      const signature = content_signature(elements, files);
      if (last_signature.current === null) {
        last_signature.current = signature;
        return;
      }
      if (signature === last_signature.current) return;
      last_signature.current = signature;

      if (change_timer.current) clearTimeout(change_timer.current);
      change_timer.current = setTimeout(() => {
        change_timer.current = null;
        const scene = snapshot_scene(api_ref.current);
        if (scene) post_to_host({ type: "scene_changed", scene });
      }, SCENE_CHANGE_DEBOUNCE_MS);
    },
    [],
  );

  if (!initial_data) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          color: "#888",
          fontFamily: "system-ui",
        }}
      >
        Waiting for scene data…
      </div>
    );
  }

  return (
    <div style={{ width: "100vw", height: "100vh" }}>
      <Excalidraw
        excalidrawAPI={(api: ExcalidrawImperativeAPI) => {
          api_ref.current = api;
        }}
        initialData={{
          elements: as_scene_elements(initial_data.elements),
          appState: {
            currentItemRoughness: 0,
            ...as_scene_app_state(initial_data.appState),
            viewBackgroundColor: theme === "dark" ? "#121212" : "#ffffff",
            theme,
          },
          files: as_scene_files(initial_data.files),
        }}
        onChange={on_change}
        theme={theme}
        UIOptions={{
          canvasActions: {
            loadScene: false,
            export: false,
            saveToActiveFile: false,
          },
        }}
      />
    </div>
  );
}

const root_element = document.getElementById("root");

if (!root_element) {
  throw new Error("Missing Excalidraw root element");
}

const root = createRoot(root_element);
root.render(<App />);
