import { describe, it, expect, vi, type Mock } from "vitest";
import {
  get_source_cursor_coords,
  resolve_inline_ai_anchor_coords,
} from "$lib/features/editor/adapters/inline_ai_anchor";

type Coords = { left: number; top: number; bottom: number; right?: number };

function make_visual_view(coords: Coords = { left: 10, top: 20, bottom: 40 }) {
  return {
    state: {
      selection: {
        $from: { pos: 5 },
      },
    },
    coordsAtPos: vi.fn(() => coords),
  } as unknown as import("prosemirror-view").EditorView;
}

function make_source_view(
  coords: Coords | null = { left: 50, top: 60, bottom: 80, right: 51 },
  head = 7,
) {
  return {
    state: {
      selection: {
        main: { head },
      },
    },
    coordsAtPos: vi.fn(() => coords),
  } as unknown as import("@codemirror/view").EditorView;
}

describe("get_source_cursor_coords", () => {
  it("returns coords at the selection head", () => {
    const view = make_source_view();
    expect(get_source_cursor_coords(view)).toEqual({
      left: 50,
      top: 60,
      bottom: 80,
    });
    expect(view.coordsAtPos).toHaveBeenCalledWith(7);
  });

  it("returns null when the view has no layout for the position", () => {
    const view = make_source_view(null);
    expect(get_source_cursor_coords(view)).toBeNull();
  });

  it("returns null when coords report the viewport origin", () => {
    const view = make_source_view({ left: 0, top: 0, bottom: 0 });
    expect(get_source_cursor_coords(view)).toBeNull();
  });

  it("returns null when coordsAtPos throws", () => {
    const view = make_source_view();
    (view.coordsAtPos as Mock).mockImplementation(() => {
      throw new Error("no layout");
    });
    expect(get_source_cursor_coords(view)).toBeNull();
  });
});

describe("resolve_inline_ai_anchor_coords", () => {
  it("uses the visual view in visual mode", () => {
    const visual_view = make_visual_view();
    const source_view = make_source_view();
    expect(
      resolve_inline_ai_anchor_coords({
        mode: "visual",
        visual_view,
        source_view,
      }),
    ).toEqual({ left: 10, top: 20, bottom: 40 });
    expect(source_view.coordsAtPos).not.toHaveBeenCalled();
  });

  it("uses the source view in source mode", () => {
    const visual_view = make_visual_view();
    const source_view = make_source_view();
    expect(
      resolve_inline_ai_anchor_coords({
        mode: "source",
        visual_view,
        source_view,
      }),
    ).toEqual({ left: 50, top: 60, bottom: 80 });
    expect(visual_view.coordsAtPos).not.toHaveBeenCalled();
  });

  it("uses the visual view in read_only mode", () => {
    const visual_view = make_visual_view();
    expect(
      resolve_inline_ai_anchor_coords({
        mode: "read_only",
        visual_view,
        source_view: null,
      }),
    ).toEqual({ left: 10, top: 20, bottom: 40 });
  });

  it("returns null in source mode without a source view", () => {
    expect(
      resolve_inline_ai_anchor_coords({
        mode: "source",
        visual_view: make_visual_view(),
        source_view: null,
      }),
    ).toBeNull();
  });

  it("returns null in visual mode without a visual view", () => {
    expect(
      resolve_inline_ai_anchor_coords({
        mode: "visual",
        visual_view: null,
        source_view: make_source_view(),
      }),
    ).toBeNull();
  });

  it("returns null instead of origin coords when the source cursor is not laid out", () => {
    expect(
      resolve_inline_ai_anchor_coords({
        mode: "source",
        visual_view: make_visual_view(),
        source_view: make_source_view({ left: 0, top: 0, bottom: 0 }),
      }),
    ).toBeNull();
  });
});
