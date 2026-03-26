import { TextSelection, Plugin, PluginKey } from "prosemirror-state";
import type { Node as ProseNode } from "prosemirror-model";
import { yUndoPlugin, undo as yUndo, redo as yRedo } from "y-prosemirror";
import { history, undo as pmUndo, redo as pmRedo } from "prosemirror-history";
import { keymap } from "prosemirror-keymap";
import { baseKeymap, chainCommands, toggleMark } from "prosemirror-commands";
import {
  splitListItem,
  liftListItem,
  sinkListItem,
} from "prosemirror-schema-list";
import { dropCursor } from "prosemirror-dropcursor";
import { gapCursor } from "prosemirror-gapcursor";
import { schema } from "../adapters/markdown_pipeline";
import { create_dirty_state_prose_plugin } from "../adapters/dirty_state_plugin";
import { create_editor_context_plugin_instance } from "../adapters/editor_context_plugin";
import { create_emoji_prose_plugin } from "../adapters/emoji_plugin";
import { create_typography_prose_plugin } from "../adapters/typography_plugin";
import { create_outline_prose_plugin } from "../adapters/outline_plugin";
import { create_block_input_rules_prose_plugin } from "../adapters/block_input_rules_plugin";
import type { EditorExtension, PluginContext } from "./types";

export function create_core_extension(ctx: PluginContext): EditorExtension {
  const plugins: Plugin[] = [];
  const use_yjs = ctx.use_yjs ?? false;
  const undo = use_yjs ? yUndo : pmUndo;
  const redo = use_yjs ? yRedo : pmRedo;

  const strikethrough_mark_type = schema.marks.strikethrough;
  const strong_mark_type = schema.marks.strong;
  const em_mark_type = schema.marks.em;
  const code_inline_mark_type = schema.marks.code_inline;

  plugins.push(
    keymap({
      "Mod-z": undo,
      "Mod-y": redo,
      "Mod-Shift-z": redo,
      ...(strong_mark_type ? { "Mod-b": toggleMark(strong_mark_type) } : {}),
      ...(em_mark_type ? { "Mod-i": toggleMark(em_mark_type) } : {}),
      ...(code_inline_mark_type
        ? { "Mod-e": toggleMark(code_inline_mark_type) }
        : {}),
      "Mod-Shift-e": (pm_state, dispatch) => {
        const { $from, $to } = pm_state.selection;
        const code_block_type = schema.nodes.code_block;

        if ($from.parent.type.name === "code_block") {
          if (!dispatch) return true;
          const pos = $from.before($from.depth);
          const node = pm_state.doc.nodeAt(pos);
          if (!node) return false;
          const text = node.textContent;
          const lines = text.split("\n");
          const paragraphs = lines.map((line) =>
            schema.nodes.paragraph.create(
              null,
              line ? schema.text(line) : undefined,
            ),
          );
          const tr = pm_state.tr.replaceWith(
            pos,
            pos + node.nodeSize,
            paragraphs,
          );
          dispatch(tr.scrollIntoView());
          return true;
        }

        if (!dispatch) return true;
        const range_start = $from.before($from.depth);
        const range_end = $to.after($to.depth);
        const text = pm_state.doc.textBetween(
          range_start,
          range_end,
          "\n",
          "\n",
        );
        const code_block = code_block_type.create(
          { language: "" },
          text ? schema.text(text) : undefined,
        );
        const tr = pm_state.tr.replaceWith(range_start, range_end, code_block);
        tr.setSelection(
          TextSelection.create(
            tr.doc,
            range_start + 1,
            range_start + 1 + text.length,
          ),
        );
        dispatch(tr.scrollIntoView());
        return true;
      },
      ...(strikethrough_mark_type
        ? { "Mod-Shift-x": toggleMark(strikethrough_mark_type) }
        : {}),
    }),
  );

  const list_item_type = schema.nodes["list_item"];
  if (list_item_type) {
    plugins.push(
      keymap({
        Enter: chainCommands(
          splitListItem(list_item_type),
          liftListItem(list_item_type),
        ),
        Tab: chainCommands(sinkListItem(list_item_type), () => true),
        "Shift-Tab": liftListItem(list_item_type),
      }),
    );
  }

  plugins.push(keymap(baseKeymap));
  plugins.push(use_yjs ? yUndoPlugin() : history());
  plugins.push(dropCursor());
  plugins.push(gapCursor());
  plugins.push(create_emoji_prose_plugin());
  plugins.push(create_typography_prose_plugin());
  plugins.push(create_block_input_rules_prose_plugin());
  plugins.push(
    create_editor_context_plugin_instance({
      note_path: ctx.get_note_path(),
    }),
  );
  plugins.push(create_outline_prose_plugin());
  plugins.push(
    create_dirty_state_prose_plugin({
      on_dirty_state_change: () => {},
    }),
  );

  return { plugins };
}

export { editor_context_plugin_key } from "../adapters/editor_context_plugin";
export { outline_plugin_key } from "../adapters/outline_plugin";
export { dirty_state_plugin_key } from "../adapters/dirty_state_plugin";
