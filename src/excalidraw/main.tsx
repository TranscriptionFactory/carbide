import React, { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Excalidraw } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import { exportToSvg } from "@excalidraw/utils/export";
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

        case "get_scene": {
          const elements = (api_ref.current?.getSceneElements() ??
            []) as SceneElements;
          const appState = (api_ref.current?.getAppState() ??
            {}) as Partial<SceneAppState>;
          const files = api_ref.current?.getFiles() ?? {};
          post_to_host({
            type: "scene_response",
            scene: {
              type: "excalidraw",
              version: 2,
              source: "carbide",
              elements: structuredClone(elements),
              appState: {
                viewBackgroundColor: appState.viewBackgroundColor ?? "#ffffff",
              },
              files,
            },
          });
          break;
        }

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

    window.addEventListener("message", handle_message);
    post_to_host({ type: "ready" });

    return () => {
      window.removeEventListener("message", handle_message);
    };
  }, []);

  const on_change = useCallback(
    (
      _elements: readonly ExcalidrawElement[],
      _appState: AppState,
      _files: BinaryFiles,
    ) => {
      post_to_host({
        type: "on_change",
        elements: [],
        appState: {},
        dirty: true,
      });
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
