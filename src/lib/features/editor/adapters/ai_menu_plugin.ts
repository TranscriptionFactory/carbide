import { Plugin, PluginKey } from "prosemirror-state";
import type { EditorState, Transaction } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import type { EditorView } from "prosemirror-view";
import type { Node as PmNode } from "prosemirror-model";
import { mount, unmount } from "svelte";
import {
  BUILTIN_INLINE_COMMANDS,
  type AiInlineCommand,
} from "$lib/features/ai";
import AiInlineMenu from "../ui/ai_inline_menu.svelte";
import {
  create_cursor_anchor,
  position_suggest_dropdown,
  mount_dropdown,
  destroy_dropdown,
  attach_outside_dismiss,
} from "./suggest_dropdown_utils";

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

export type AiMenuPluginConfig = {
  on_execute: (payload: { command_id?: string; prompt?: string }) => void;
  get_commands?: () => AiInlineCommand[];
  on_open_settings?: () => void;
};

function get_meta(tr: Transaction): AiMenuMeta | undefined {
  return tr.getMeta(ai_menu_plugin_key) as AiMenuMeta | undefined;
}

export function dispatch_ai_menu(view: EditorView, meta: AiMenuMeta): void {
  view.dispatch(view.state.tr.setMeta(ai_menu_plugin_key, meta));
}

export function get_ai_menu_state(state: EditorState): AiMenuState {
  return ai_menu_plugin_key.getState(state) ?? EMPTY_STATE;
}

export function reject_ai_inline(view: EditorView): void {
  const state = get_ai_menu_state(view.state);
  if (state.original_doc) {
    const tr = view.state.tr.replaceWith(
      0,
      view.state.doc.content.size,
      state.original_doc.content,
    );
    tr.setMeta("addToHistory", false);
    tr.setMeta(ai_menu_plugin_key, { action: "reject" });
    view.dispatch(tr);
  } else {
    dispatch_ai_menu(view, { action: "reject" });
  }
}

export function create_ai_menu_plugin(
  config?: AiMenuPluginConfig,
): Plugin<AiMenuState> {
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
    },

    view(editor_view: EditorView) {
      const container = document.createElement("div");
      container.className = "AiInlineMenuWrapper";
      mount_dropdown(container);

      let svelte_app: ReturnType<typeof mount> | null = null;
      let prev_open = false;
      let prev_mode: AiMenuMode | null = null;
      let prev_streaming: boolean | null = null;

      function ensure_menu(state: AiMenuState) {
        if (
          svelte_app &&
          prev_mode === state.mode &&
          prev_streaming === state.streaming
        ) {
          return;
        }
        if (svelte_app) unmount(svelte_app);
        const commands = config?.get_commands?.() ?? BUILTIN_INLINE_COMMANDS;
        const open_settings = config?.on_open_settings;
        svelte_app = mount(AiInlineMenu, {
          target: container,
          props: {
            mode: state.mode,
            streaming: state.streaming,
            commands,
            on_submit: (prompt: string) => config?.on_execute?.({ prompt }),
            on_command: (id: string) =>
              config?.on_execute?.({ command_id: id }),
            on_accept: () =>
              dispatch_ai_menu(editor_view, { action: "accept" }),
            on_reject: () => reject_ai_inline(editor_view),
            on_close: () => dispatch_ai_menu(editor_view, { action: "close" }),
            ...(open_settings ? { on_open_settings: open_settings } : {}),
          },
        });
        prev_mode = state.mode;
        prev_streaming = state.streaming;
      }

      const detach_dismiss = attach_outside_dismiss(
        container,
        editor_view.dom,
        () => {
          const s = get_ai_menu_state(editor_view.state);
          if (s.open && !s.streaming) {
            dispatch_ai_menu(editor_view, { action: "close" });
          }
        },
      );

      return {
        update(view: EditorView) {
          const state = get_ai_menu_state(view.state);
          if (state.open) {
            const needs_position = !prev_open;
            ensure_menu(state);
            container.style.display = "block";
            if (needs_position) {
              const anchor = create_cursor_anchor(view);
              position_suggest_dropdown(container, anchor);
            }
          } else if (prev_open) {
            container.style.display = "none";
            if (svelte_app) {
              unmount(svelte_app);
              svelte_app = null;
            }
            prev_mode = null;
            prev_streaming = null;
          }
          prev_open = state.open;
        },
        destroy() {
          if (svelte_app) unmount(svelte_app);
          destroy_dropdown(container, detach_dismiss);
        },
      };
    },
  });
}
