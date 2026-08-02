// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { Schema } from "prosemirror-model";
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import {
  create_ai_menu_plugin,
  dispatch_ai_menu,
  get_ai_menu_state,
} from "$lib/features/editor/adapters/ai_menu_plugin";
import type { AiMenuPluginConfig } from "$lib/features/editor/adapters/ai_menu_plugin";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: {
      group: "block",
      content: "inline*",
      toDOM: () => ["p", 0] as const,
    },
    text: { group: "inline" },
  },
});

function mount_menu(config?: AiMenuPluginConfig) {
  const mount_point = document.createElement("div");
  document.body.appendChild(mount_point);
  const view = new EditorView(mount_point, {
    state: EditorState.create({
      doc: schema.node("doc", null, [
        schema.node("paragraph", null, [schema.text("Hello world")]),
      ]),
      plugins: [create_ai_menu_plugin(config)],
    }),
  });

  dispatch_ai_menu(view, { action: "open" });
  dispatch_ai_menu(view, { action: "start_stream", anchor_pos: 1 });
  dispatch_ai_menu(view, { action: "stream_text", text: "draft" });
  dispatch_ai_menu(view, { action: "stream_done" });

  return {
    view,
    cleanup: () => {
      view.destroy();
    },
  };
}

function click_accept() {
  const button = document.querySelector<HTMLButtonElement>(
    '[data-testid="ai-inline-accept"]',
  );
  if (!button) throw new Error("the accept button was never rendered");
  button.click();
}

// The accept button used to dispatch straight into the plugin, which left
// ACTION_IDS.ai_accept_inline unreachable and the inline exchange unlogged.
describe("inline accept routing", () => {
  it("hands accept to the host so the action runs", () => {
    const on_accept = vi.fn();
    const { view, cleanup } = mount_menu({ on_execute: vi.fn(), on_accept });

    click_accept();

    expect(on_accept).toHaveBeenCalledTimes(1);
    // The host owns the dispatch now, so the plugin must not have accepted too.
    expect(get_ai_menu_state(view.state).open).toBe(true);
    cleanup();
  });

  it("still accepts on its own when no host is listening", () => {
    const { view, cleanup } = mount_menu({ on_execute: vi.fn() });

    click_accept();

    expect(get_ai_menu_state(view.state).open).toBe(false);
    cleanup();
  });
});
