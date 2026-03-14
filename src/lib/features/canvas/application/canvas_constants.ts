import type { Camera, CanvasData } from "$lib/features/canvas/types/canvas";

export const CANVAS_SPEC_VERSION = "1.0";

export const DEFAULT_CAMERA: Camera = { x: 0, y: 0, zoom: 1 };

export const EMPTY_CANVAS: CanvasData = { nodes: [], edges: [] };

export const EMPTY_EXCALIDRAW_SCENE = {
  type: "excalidraw",
  version: 2,
  source: "otterly",
  elements: [],
  appState: { viewBackgroundColor: "#ffffff" },
  files: {},
};
