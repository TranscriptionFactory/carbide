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

function click_reject() {
  const button = document.querySelector<HTMLButtonElement>(
    '[data-testid="ai-inline-reject"]',
  );
  if (!button) throw new Error("the discard button was never rendered");
  button.click();
}

function press_escape() {
  document.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
  );
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

// Reject had the same defect accept had above: the plugin discarded on its own
// and ACTION_IDS.ai_reject_inline was unreachable from the app, so the run's
// session was left open with an empty reply and never recorded the discard.
describe("inline reject routing", () => {
  it("hands Discard to the host so the action runs", () => {
    const on_reject = vi.fn();
    const { view, cleanup } = mount_menu({ on_execute: vi.fn(), on_reject });

    click_reject();

    expect(on_reject).toHaveBeenCalledTimes(1);
    // The host owns the discard now, so the plugin must not have rejected too.
    expect(get_ai_menu_state(view.state).open).toBe(true);
    cleanup();
  });

  // Escape and an outside click are the same decision as Discard to the run
  // behind the menu, and they reach it through dismiss_menu rather than the
  // button — so they need routing too, not just the visible control.
  it("hands an Escape dismissal to the host as well", () => {
    const on_reject = vi.fn();
    const { view, cleanup } = mount_menu({ on_execute: vi.fn(), on_reject });

    press_escape();

    expect(on_reject).toHaveBeenCalledTimes(1);
    expect(get_ai_menu_state(view.state).open).toBe(true);
    cleanup();
  });

  it("still discards on its own when no host is listening", () => {
    const { view, cleanup } = mount_menu({ on_execute: vi.fn() });

    click_reject();

    expect(get_ai_menu_state(view.state).open).toBe(false);
    cleanup();
  });
});

// The autosave hold is only as good as this signal: the plugin is the one
// place that sees every way a preview ends, and every one of them has to
// release the hold or the note stops saving for the rest of the session.
describe("inline preview signal", () => {
  it("reports the preview opening and closing exactly once each", () => {
    const on_preview_change = vi.fn();
    const { view, cleanup } = mount_menu({
      on_execute: vi.fn(),
      on_preview_change,
    });

    expect(on_preview_change.mock.calls).toEqual([[true]]);

    dispatch_ai_menu(view, { action: "accept" });

    expect(on_preview_change.mock.calls).toEqual([[true], [false]]);
    cleanup();
  });

  it("releases the preview when it is rejected", () => {
    const on_preview_change = vi.fn();
    const { view, cleanup } = mount_menu({
      on_execute: vi.fn(),
      on_preview_change,
    });

    dispatch_ai_menu(view, { action: "reject" });

    expect(on_preview_change).toHaveBeenLastCalledWith(false);
    cleanup();
  });

  it("releases the preview when the session is destroyed mid-stream", () => {
    const on_preview_change = vi.fn();
    const { cleanup } = mount_menu({
      on_execute: vi.fn(),
      on_preview_change,
    });

    cleanup();

    expect(on_preview_change).toHaveBeenLastCalledWith(false);
  });
});
