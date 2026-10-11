/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EditorState, TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { schema } from "$lib/features/editor/adapters/schema";
import {
  create_commands,
  type SlashCommandConfig,
} from "$lib/features/editor/adapters/slash_command_plugin";
import { block_insert_commands } from "$lib/features/editor/adapters/block_insert_menu";
import { create_wiki_suggest_prose_plugin } from "$lib/features/editor/adapters/wiki_suggest_plugin";
import { pick_image_payload } from "$lib/features/editor/adapters/formatting_toolbar_commands";
import type { PastedImagePayload } from "$lib/shared/types/editor";

vi.mock(
  "$lib/features/editor/adapters/formatting_toolbar_commands",
  async (import_original) => ({
    ...(await import_original<object>()),
    pick_image_payload: vi.fn(),
  }),
);

const picked: PastedImagePayload = {
  bytes: new Uint8Array([1, 2, 3]),
  mime_type: "image/png",
  file_name: "cat.png",
};

let view: EditorView | null = null;

beforeEach(() => {
  vi.mocked(pick_image_payload).mockReset();
});

afterEach(() => {
  view?.destroy();
  view = null;
  document.body.innerHTML = "";
});

function mount_with_slash_text(
  text: string,
  plugins: EditorState["plugins"] = [],
): EditorView {
  const doc = schema.nodes.doc.create(null, [
    schema.nodes.paragraph.create(null, schema.text(text)),
  ]);
  const target = document.createElement("div");
  document.body.appendChild(target);
  const mounted = new EditorView(target, {
    state: EditorState.create({ schema, doc, plugins }),
  });
  mounted.dispatch(
    mounted.state.tr.setSelection(TextSelection.create(doc, 1 + text.length)),
  );
  view = mounted;
  return mounted;
}

function find_cmd(id: string, config?: SlashCommandConfig) {
  const cmd = create_commands(config).find((c) => c.id === id);
  if (!cmd) throw new Error(`command "${id}" not found`);
  return cmd;
}

describe("/image slash command", () => {
  it("is offered only when an image callback is configured", () => {
    expect(create_commands().map((c) => c.id)).not.toContain("image");
    expect(
      create_commands({ on_image_payload: vi.fn() }).map((c) => c.id),
    ).toContain("image");
  });

  it("clears the slash text and hands the picked image to the callback", async () => {
    vi.mocked(pick_image_payload).mockResolvedValue(picked);
    const on_image_payload = vi.fn();
    const mounted = mount_with_slash_text("/image");

    find_cmd("image", { on_image_payload }).insert(mounted, 1);

    expect(mounted.state.doc.textContent).toBe("");
    expect(pick_image_payload).toHaveBeenCalledTimes(1);
    await vi.waitUntil(() => on_image_payload.mock.calls.length === 1);
    expect(on_image_payload).toHaveBeenCalledWith(picked);
  });

  it("inserts nothing when the picker is cancelled", async () => {
    vi.mocked(pick_image_payload).mockResolvedValue(null);
    const on_image_payload = vi.fn();
    const mounted = mount_with_slash_text("/image");

    find_cmd("image", { on_image_payload }).insert(mounted, 1);
    await vi.mocked(pick_image_payload).mock.results[0]?.value;

    expect(on_image_payload).not.toHaveBeenCalled();
    expect(mounted.state.doc.childCount).toBe(1);
    expect(mounted.state.doc.textContent).toBe("");
  });
});

describe("/embed slash command", () => {
  it("replaces the slash text with ![[ and opens the note suggester", async () => {
    const on_query = vi.fn();
    const mounted = mount_with_slash_text("/embed", [
      create_wiki_suggest_prose_plugin({
        on_query,
        on_dismiss: vi.fn(),
        base_note_path: "source.md",
      }),
    ]);

    find_cmd("embed").insert(mounted, 1);

    expect(mounted.state.doc.textContent).toBe("![[");
    expect(mounted.state.selection.from).toBe(1 + "![[".length);
    await vi.waitUntil(() => on_query.mock.calls.length > 0);
    expect(on_query).toHaveBeenLastCalledWith({ kind: "note", query: "" });
  });
});

describe("block insert menu embeds", () => {
  it("lists /image and /embed alongside the slash menu", () => {
    const state = EditorState.create({
      schema,
      doc: schema.nodes.doc.create(null, [schema.nodes.paragraph.create()]),
    });

    const ids = block_insert_commands(state, {
      on_image_payload: vi.fn(),
    }).map((c) => c.id);

    expect(ids).toContain("image");
    expect(ids).toContain("embed");
  });
});
