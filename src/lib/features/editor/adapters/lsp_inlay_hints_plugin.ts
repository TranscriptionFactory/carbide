import { Plugin, PluginKey } from "prosemirror-state";
import type { EditorState } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import type { EditorView } from "prosemirror-view";
import type { MarkdownLspInlayHint } from "$lib/features/markdown_lsp";
import { lsp_pos_to_prose_pos } from "./lsp_plugin_utils";

const lsp_inlay_hints_plugin_key = new PluginKey<DecorationSet>(
  "lsp-inlay-hints",
);

function apply_hints(
  view: EditorView,
  hints: MarkdownLspInlayHint[],
  get_markdown: () => string,
) {
  if (hints.length === 0) {
    view.dispatch(
      view.state.tr.setMeta(lsp_inlay_hints_plugin_key, DecorationSet.empty),
    );
    return;
  }

  const doc = view.state.doc;
  const markdown = get_markdown();
  const decorations: Decoration[] = [];

  for (const hint of hints) {
    const pos = lsp_pos_to_prose_pos(
      doc,
      markdown,
      hint.position_line,
      hint.position_character,
    );
    const clamped = Math.min(Math.max(pos, 1), doc.content.size);

    const widget = document.createElement("span");
    widget.className = "lsp-inlay-hint";
    widget.textContent = hint.label;

    decorations.push(Decoration.widget(clamped, widget, { side: 1 }));
  }

  const deco_set = DecorationSet.create(doc, decorations);
  view.dispatch(view.state.tr.setMeta(lsp_inlay_hints_plugin_key, deco_set));
}

export function create_lsp_inlay_hints_plugin(input: {
  on_inlay_hints: () => Promise<MarkdownLspInlayHint[]>;
  get_markdown: () => string;
}): Plugin {
  let debounce_timer: ReturnType<typeof setTimeout> | null = null;
  let fetch_in_flight = false;

  return new Plugin({
    key: lsp_inlay_hints_plugin_key,

    state: {
      init: () => DecorationSet.empty,
      apply(tr, prev) {
        const meta = tr.getMeta(lsp_inlay_hints_plugin_key) as
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
          lsp_inlay_hints_plugin_key.getState(state) ?? DecorationSet.empty
        );
      },
    },

    view(editor_view) {
      void input.on_inlay_hints().then((hints) => {
        apply_hints(editor_view, hints, input.get_markdown);
      });

      return {
        update(view, prev_state: EditorState) {
          if (!view.state.doc.eq(prev_state.doc)) {
            if (debounce_timer) clearTimeout(debounce_timer);
            debounce_timer = setTimeout(() => {
              if (fetch_in_flight) return;
              fetch_in_flight = true;
              void input.on_inlay_hints().then((hints) => {
                fetch_in_flight = false;
                apply_hints(view, hints, input.get_markdown);
              });
            }, 1000);
          }
        },
        destroy() {
          if (debounce_timer) clearTimeout(debounce_timer);
          debounce_timer = null;
        },
      };
    },
  });
}
