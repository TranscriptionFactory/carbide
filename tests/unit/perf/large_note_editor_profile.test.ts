/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { TextSelection } from "prosemirror-state";
import { create_prosemirror_editor_port } from "$lib/features/editor/adapters/prosemirror_adapter";
import {
  parse_markdown,
  serialize_markdown,
} from "$lib/features/editor/adapters/markdown_pipeline";
import {
  build_offset_index,
  md_offset_to_prose_pos,
} from "$lib/features/editor/adapters/cursor_offset_mapper";
import { normalize_markdown_line_breaks } from "$lib/features/editor/domain/markdown_line_breaks";
import { extract_metadata } from "$lib/features/metadata";
import { build_large_markdown } from "../helpers/large_markdown_fixture";

// Records stage timings for a large note; never asserts them. The full
// ~800KB run is opt-in (CARBIDE_PROFILE=1) so the default suite stays fast.
const FULL = import.meta.env["CARBIDE_PROFILE"] === "1";
const TARGET_CHARS = FULL ? 800_000 : 40_000;
const LABEL = import.meta.env["CARBIDE_PROFILE_LABEL"] ?? "run";
const KEYSTROKES = 100;

function time<T>(timings: Record<string, number>, stage: string, fn: () => T) {
  const start = performance.now();
  const result = fn();
  timings[stage] = Math.round((performance.now() - start) * 100) / 100;
  return result;
}

function write_probe(payload: object) {
  const dir = resolve(__dirname, "../../../.tmpfiles/probe");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    resolve(dir, `large_note_${LABEL}_${TARGET_CHARS}.json`),
    JSON.stringify(payload, null, 2),
  );
}

describe("large note editor profile", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("records per-stage timings", async () => {
    const markdown = build_large_markdown(TARGET_CHARS);
    const timings: Record<string, number> = {};

    const normalized = time(timings, "normalize", () =>
      normalize_markdown_line_breaks(markdown),
    );
    const doc = time(timings, "parse", () => parse_markdown(normalized));

    const root = document.createElement("div");
    document.body.appendChild(root);
    const port = create_prosemirror_editor_port();
    const session = await (async () => {
      const start = performance.now();
      const s = await port.start_session({
        root,
        initial_markdown: markdown,
        note_path: "large.md",
        vault_id: null,
        events: {
          on_markdown_change: vi.fn(),
          on_dirty_state_change: vi.fn(),
          on_cursor_change: vi.fn(),
          on_selection_change: vi.fn(),
          on_outline_change: vi.fn(),
        },
      });
      timings.start_session =
        Math.round((performance.now() - start) * 100) / 100;
      return s;
    })();

    const view = session.get_view?.();
    if (!view) throw new Error("session exposes no view");
    const mid = Math.floor(view.state.doc.content.size / 2);
    const text_pos = TextSelection.near(view.state.doc.resolve(mid)).from;

    time(timings, "insert_x100", () => {
      for (let i = 0; i < KEYSTROKES; i++) {
        view.dispatch(view.state.tr.insertText("x", text_pos + i));
      }
    });
    time(timings, "select_x100", () => {
      for (let i = 0; i < KEYSTROKES; i++) {
        const $pos = view.state.doc.resolve(text_pos + (i % 20));
        view.dispatch(view.state.tr.setSelection(TextSelection.near($pos)));
      }
    });

    const serialized = time(timings, "serialize", () =>
      serialize_markdown(view.state.doc),
    );
    time(timings, "extract_metadata", () => extract_metadata(serialized));
    time(timings, "build_offset_index", () =>
      build_offset_index(view.state.doc, serialized),
    );
    time(timings, "md_offset_to_prose_pos", () =>
      md_offset_to_prose_pos(
        view.state.doc,
        Math.floor(serialized.length / 2),
        serialized,
      ),
    );

    session.destroy();

    write_probe({
      label: LABEL,
      chars: markdown.length,
      top_level_blocks: doc.childCount,
      timings_ms: timings,
    });
    expect(doc.childCount).toBeGreaterThan(0);
  }, 600_000);
});
