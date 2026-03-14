export type NodeSide = "top" | "right" | "bottom" | "left";
export type EndStyle = "none" | "arrow";

export type Camera = {
  x: number;
  y: number;
  zoom: number;
};

type BaseNode = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
  [key: string]: unknown;
};

export type TextNode = BaseNode & { type: "text"; text: string };
export type FileNode = BaseNode & {
  type: "file";
  file: string;
  subpath?: string;
};
export type LinkNode = BaseNode & { type: "link"; url: string };
export type GroupNode = BaseNode & {
  type: "group";
  label?: string;
  background?: string;
  backgroundStyle?: string;
};

export type CanvasNode = TextNode | FileNode | LinkNode | GroupNode;

export type CanvasEdge = {
  id: string;
  fromNode: string;
  fromSide?: NodeSide;
  fromEnd?: EndStyle;
  toNode: string;
  toSide?: NodeSide;
  toEnd?: EndStyle;
  color?: string;
  label?: string;
  [key: string]: unknown;
};

export type CanvasData = {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  [key: string]: unknown;
};
