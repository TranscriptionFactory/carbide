import { parseMermaidToExcalidraw } from "@excalidraw/mermaid-to-excalidraw";
import { convertToExcalidrawElements } from "@excalidraw/excalidraw";
import { EMPTY_EXCALIDRAW_SCENE } from "$lib/features/canvas";

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
  const full_elements = convertToExcalidrawElements(elements);
  return {
    ...EMPTY_EXCALIDRAW_SCENE,
    elements: full_elements,
    files: ensure_file_fields(
      files as Record<string, Record<string, unknown>> | undefined,
    ),
  };
}
