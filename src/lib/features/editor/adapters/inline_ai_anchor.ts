import type { EditorView } from "prosemirror-view";
import type { EditorView as SourceEditorView } from "@codemirror/view";
import type { EditorMode } from "$lib/shared/types/editor";
import { get_cursor_coords, type CursorCoords } from "./suggest_dropdown_utils";

export function get_source_cursor_coords(
  view: SourceEditorView,
): CursorCoords | null {
  let coords: { left: number; top: number; bottom: number } | null;
  try {
    coords = view.coordsAtPos(view.state.selection.main.head);
  } catch {
    return null;
  }
  if (!coords) return null;
  if (coords.left === 0 && coords.top === 0 && coords.bottom === 0) {
    return null;
  }
  return { left: coords.left, top: coords.top, bottom: coords.bottom };
}

export function resolve_inline_ai_anchor_coords(input: {
  mode: EditorMode;
  visual_view: EditorView | null;
  source_view: SourceEditorView | null;
}): CursorCoords | null {
  if (input.mode === "source") {
    return input.source_view
      ? get_source_cursor_coords(input.source_view)
      : null;
  }
  return input.visual_view ? get_cursor_coords(input.visual_view) : null;
}
