import { Plugin, PluginKey } from "prosemirror-state";
import type { EditorState } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import type { EditorView } from "prosemirror-view";
import type { IweInlayHint } from "$lib/features/iwe";
import { offset_for_line_character } from "./iwe_plugin_utils";

const iwe_inlay_hints_plugin_key = new PluginKey<DecorationSet>(
  "iwe-inlay-hints",
);

function apply_hints(view: EditorView, hints: IweInlayHint[]) {
  if (hints.length === 0) {
    view.dispatch(
      view.state.tr.setMeta(iwe_inlay_hints_plugin_key, DecorationSet.empty),
    );
    return;
  }

  const doc = view.state.doc;
  const doc_text = doc.textBetween(0, doc.content.size, "\n");
  const decorations: Decoration[] = [];

  for (const hint of hints) {
    const text_offset = offset_for_line_character(
      doc_text,
      hint.position_line,
      hint.position_character,
    );
    const pos = Math.min(text_offset + 1, doc.content.size);

    const widget = document.createElement("span");
    widget.className = "iwe-inlay-hint";
    widget.textContent = hint.label;

    decorations.push(Decoration.widget(pos, widget, { side: 1 }));
  }

  const deco_set = DecorationSet.create(doc, decorations);
  view.dispatch(view.state.tr.setMeta(iwe_inlay_hints_plugin_key, deco_set));
}

export function create_iwe_inlay_hints_plugin(input: {
  on_inlay_hints: () => Promise<IweInlayHint[]>;
}): Plugin {
  let debounce_timer: ReturnType<typeof setTimeout> | null = null;

  return new Plugin({
    key: iwe_inlay_hints_plugin_key,

    state: {
      init: () => DecorationSet.empty,
      apply(tr, prev) {
        const meta = tr.getMeta(iwe_inlay_hints_plugin_key) as
          | DecorationSet
          | undefined;
        if (meta !== undefined) return meta;
        if (tr.docChanged) return prev.map(tr.mapping, tr.doc);
        return prev;
      },
    },

    props: {
      decorations(state) {
        return (
          iwe_inlay_hints_plugin_key.getState(state) ?? DecorationSet.empty
        );
      },
    },

    view(editor_view) {
      void input.on_inlay_hints().then((hints) => {
        apply_hints(editor_view, hints);
      });

      return {
        update(view, prev_state: EditorState) {
          if (view.state.doc === prev_state.doc) return;
          if (debounce_timer) clearTimeout(debounce_timer);
          debounce_timer = setTimeout(() => {
            void input.on_inlay_hints().then((hints) => {
              apply_hints(view, hints);
            });
          }, 1000);
        },
        destroy() {
          if (debounce_timer) clearTimeout(debounce_timer);
          debounce_timer = null;
        },
      };
    },
  });
}
