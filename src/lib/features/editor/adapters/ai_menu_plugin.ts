import { Plugin, PluginKey } from "prosemirror-state";
import type { EditorState, Transaction } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import type { EditorView } from "prosemirror-view";
import type { Node as PmNode } from "prosemirror-model";

export const ai_menu_plugin_key = new PluginKey<AiMenuState>("ai-inline-menu");

export type AiMenuMode =
  | "cursor_command"
  | "selection_command"
  | "cursor_suggestion";

export type AiMenuState = {
  open: boolean;
  mode: AiMenuMode;
  streaming: boolean;
  anchor_pos: number;
  original_doc: PmNode | null;
  ai_range_from: number;
  ai_range_to: number;
};

const EMPTY_STATE: AiMenuState = {
  open: false,
  mode: "cursor_command",
  streaming: false,
  anchor_pos: 0,
  original_doc: null,
  ai_range_from: 0,
  ai_range_to: 0,
};

export type AiMenuMeta =
  | { action: "open" }
  | { action: "close" }
  | { action: "start_stream"; anchor_pos: number }
  | { action: "stream_text"; text: string }
  | { action: "stream_done" }
  | { action: "accept" }
  | { action: "reject" };

function get_meta(tr: Transaction): AiMenuMeta | undefined {
  return tr.getMeta(ai_menu_plugin_key) as AiMenuMeta | undefined;
}

export function dispatch_ai_menu(view: EditorView, meta: AiMenuMeta): void {
  view.dispatch(view.state.tr.setMeta(ai_menu_plugin_key, meta));
}

export function get_ai_menu_state(state: EditorState): AiMenuState {
  return ai_menu_plugin_key.getState(state) ?? EMPTY_STATE;
}

export function create_ai_menu_plugin(): Plugin<AiMenuState> {
  return new Plugin<AiMenuState>({
    key: ai_menu_plugin_key,

    state: {
      init(): AiMenuState {
        return EMPTY_STATE;
      },

      apply(tr, prev, _old_state, new_state): AiMenuState {
        const meta = get_meta(tr);
        if (!meta) return prev;

        switch (meta.action) {
          case "open": {
            const { selection } = new_state;
            const has_selection = !selection.empty;
            return {
              ...EMPTY_STATE,
              open: true,
              mode: has_selection ? "selection_command" : "cursor_command",
              anchor_pos: selection.from,
            };
          }
          case "close":
            return EMPTY_STATE;

          case "start_stream":
            return {
              ...prev,
              streaming: true,
              original_doc: tr.before,
              ai_range_from: meta.anchor_pos,
              ai_range_to: meta.anchor_pos,
            };

          case "stream_text": {
            const inserted_length = meta.text.length;
            return {
              ...prev,
              ai_range_to: prev.ai_range_to + inserted_length,
            };
          }

          case "stream_done":
            return {
              ...prev,
              streaming: false,
              mode: "cursor_suggestion",
            };

          case "accept":
            return EMPTY_STATE;

          case "reject":
            return EMPTY_STATE;
        }
      },
    },

    props: {
      decorations(state: EditorState): DecorationSet {
        const ps = ai_menu_plugin_key.getState(state);
        if (!ps || !ps.open) return DecorationSet.empty;
        if (ps.ai_range_from === ps.ai_range_to && !ps.streaming) {
          return DecorationSet.empty;
        }

        const decos: Decoration[] = [];

        if (ps.ai_range_from < ps.ai_range_to) {
          decos.push(
            Decoration.inline(ps.ai_range_from, ps.ai_range_to, {
              class: "ai-highlight",
            }),
          );
        }

        if (ps.streaming) {
          decos.push(
            Decoration.widget(ps.ai_range_to, () => {
              const dot = document.createElement("span");
              dot.className = "ai-stream-cursor";
              return dot;
            }),
          );
        }

        return DecorationSet.create(state.doc, decos);
      },

      handleKeyDown(view, event) {
        if (
          (event.metaKey || event.ctrlKey) &&
          event.key === "j" &&
          !event.shiftKey &&
          !event.altKey
        ) {
          event.preventDefault();
          dispatch_ai_menu(view, { action: "open" });
          return true;
        }
        return false;
      },
    },
  });
}
