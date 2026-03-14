import React, { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Excalidraw } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { HostMessage, ExcalidrawScene } from "./bridge";
import { post_to_host } from "./bridge";

function App() {
  const api_ref = useRef<ExcalidrawImperativeAPI | null>(null);
  const [initial_data, set_initial_data] = useState<ExcalidrawScene | null>(
    null,
  );
  const [theme, set_theme] = useState<"light" | "dark">("light");
  const dirty_ref = useRef(false);

  useEffect(() => {
    function handle_message(event: MessageEvent<HostMessage>) {
      const msg = event.data;
      if (!msg || typeof msg !== "object" || !("type" in msg)) return;

      switch (msg.type) {
        case "init_scene":
          set_initial_data(msg.scene);
          break;

        case "update_scene":
          api_ref.current?.updateScene({
            elements: msg.elements as any,
            appState: msg.appState as any,
          });
          break;

        case "get_scene": {
          const elements = api_ref.current?.getSceneElements() ?? [];
          const appState = api_ref.current?.getAppState() ?? {};
          const files = api_ref.current?.getFiles() ?? {};
          post_to_host({
            type: "scene_response",
            scene: {
              type: "excalidraw",
              version: 2,
              source: "badgerly",
              elements: JSON.parse(JSON.stringify(elements)),
              appState: {
                viewBackgroundColor:
                  (appState as any).viewBackgroundColor ?? "#ffffff",
              },
              files: files as any,
            },
          });
          break;
        }

        case "theme_sync":
          set_theme(msg.theme);
          break;
      }
    }

    window.addEventListener("message", handle_message);
    post_to_host({ type: "ready" });

    return () => window.removeEventListener("message", handle_message);
  }, []);

  const on_change = useCallback((elements: readonly any[], appState: any) => {
    dirty_ref.current = true;
    post_to_host({
      type: "on_change",
      elements: JSON.parse(JSON.stringify(elements)),
      appState: {
        viewBackgroundColor: appState?.viewBackgroundColor ?? "#ffffff",
      },
      dirty: true,
    });
  }, []);

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
        ref={(api: ExcalidrawImperativeAPI) => {
          api_ref.current = api;
        }}
        initialData={{
          elements: initial_data.elements as any,
          appState: {
            ...(initial_data.appState ?? {}),
            theme,
          } as any,
          files: initial_data.files as any,
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

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
