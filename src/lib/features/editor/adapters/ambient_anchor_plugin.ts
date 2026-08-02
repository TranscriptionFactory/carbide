import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet, type EditorView } from "prosemirror-view";
import type { Node as ProseNode } from "prosemirror-model";
import type { AmbientNotice } from "$lib/features/assistant";
import { resolve_ambient_anchor } from "$lib/features/editor/domain/ambient_anchor";

export const AMBIENT_ANCHOR_CLASS = "ambient-anchor";

type AmbientAnchorState = {
  decorations: DecorationSet;
  notices: AmbientNotice[];
};

export const ambient_anchor_plugin_key = new PluginKey<AmbientAnchorState>(
  "ambient-anchor",
);

function build_decorations(
  doc: ProseNode,
  notices: AmbientNotice[],
): DecorationSet {
  const decorations: Decoration[] = [];

  for (const notice of notices) {
    const range = resolve_ambient_anchor(doc, notice.anchor);
    if (!range) continue;

    decorations.push(
      Decoration.inline(range.from, range.to, {
        class: AMBIENT_ANCHOR_CLASS,
        "data-ambient-notice-id": notice.id,
      }),
    );
  }

  return DecorationSet.create(doc, decorations);
}

// Offer-only (I6): this dispatches a meta-only transaction, so the plugin can
// never write into the note it annotates.
export function update_prosemirror_ambient_anchors(
  view: EditorView,
  notices: AmbientNotice[],
): void {
  view.dispatch(view.state.tr.setMeta(ambient_anchor_plugin_key, notices));
}

export function create_ambient_anchor_plugin(): Plugin<AmbientAnchorState> {
  return new Plugin<AmbientAnchorState>({
    key: ambient_anchor_plugin_key,

    state: {
      init: () => ({ decorations: DecorationSet.empty, notices: [] }),

      apply(tr, plugin_state, _old_state, new_state) {
        const pushed = tr.getMeta(ambient_anchor_plugin_key) as
          | AmbientNotice[]
          | undefined;

        if (pushed === undefined && !tr.docChanged) return plugin_state;

        const notices = pushed ?? plugin_state.notices;
        return {
          notices,
          decorations: build_decorations(new_state.doc, notices),
        };
      },
    },

    props: {
      decorations(state) {
        return ambient_anchor_plugin_key.getState(state)?.decorations;
      },
    },
  });
}
