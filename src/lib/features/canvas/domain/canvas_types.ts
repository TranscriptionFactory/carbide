export type {
  NodeSide,
  EndStyle,
  Camera,
  TextNode,
  FileNode,
  LinkNode,
  GroupNode,
  CanvasNode,
  CanvasEdge,
  CanvasData,
} from "$lib/features/canvas/types/canvas";

export const DEFAULT_CAMERA = { x: 0, y: 0, zoom: 1 } as const;
