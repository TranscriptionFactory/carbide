import { parseMermaidToExcalidraw } from "@excalidraw/mermaid-to-excalidraw";
import { EMPTY_EXCALIDRAW_SCENE } from "$lib/features/canvas";

function random_id(): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < 21; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

function random_int(): number {
  return Math.floor(Math.random() * 2_000_000_000);
}

const ELEMENT_DEFAULTS = {
  version: 1,
  versionNonce: 0,
  index: "a0",
  isDeleted: false,
  fillStyle: "solid",
  strokeWidth: 2,
  strokeStyle: "solid",
  roughness: 1,
  opacity: 100,
  angle: 0,
  strokeColor: "#1e1e1e",
  backgroundColor: "transparent",
  groupIds: [] as string[],
  frameId: null,
  roundness: null,
  boundElements: null,
  updated: 0,
  link: null,
  locked: false,
};

function ensure_element_fields(el: Record<string, unknown>, idx: number) {
  const now = Date.now();
  return {
    ...ELEMENT_DEFAULTS,
    ...el,
    id: el["id"] || random_id(),
    seed: el["seed"] || random_int(),
    versionNonce: el["versionNonce"] || random_int(),
    updated: el["updated"] || now,
    index: el["index"] || `a${String(idx)}`,
  };
}

function ensure_file_fields(
  files: Record<string, Record<string, unknown>> | undefined,
): Record<string, unknown> {
  if (!files) return {};
  const now = Date.now();
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(files)) {
    result[key] = {
      ...value,
      created: value["created"] || now,
    };
  }
  return result;
}

export async function convert_mermaid_to_excalidraw(code: string) {
  const { elements, files } = await parseMermaidToExcalidraw(code);
  const full_elements = (elements ?? []).map((el, i) =>
    ensure_element_fields(el as unknown as Record<string, unknown>, i),
  );
  return {
    ...EMPTY_EXCALIDRAW_SCENE,
    elements: full_elements,
    files: ensure_file_fields(
      files as Record<string, Record<string, unknown>> | undefined,
    ),
  };
}
