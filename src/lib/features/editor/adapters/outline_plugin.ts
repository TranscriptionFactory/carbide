import { Plugin, PluginKey } from "prosemirror-state";
import type { Node as ProseNode } from "prosemirror-model";
import type { OutlineHeading } from "$lib/features/outline";

type OutlinePluginState = {
  headings: OutlineHeading[];
};

export const outline_plugin_key = new PluginKey<OutlinePluginState>("outline");

export function extract_headings(doc: ProseNode): OutlineHeading[] {
  const headings: OutlineHeading[] = [];
  const occurrence_counts = new Map<string, number>();

  doc.descendants((node, pos) => {
    if (node.type.name === "heading" && node.attrs.level) {
      const level = node.attrs.level as number;
      const text = node.textContent;
      const slug = `h-${String(level)}-${text
        .toLowerCase()
        .replace(/[^\w]+/g, "-")
        .replace(/^-|-$/g, "")}`;
      const count = occurrence_counts.get(slug) ?? 0;
      occurrence_counts.set(slug, count + 1);

      headings.push({
        id: `${slug}-${String(count)}`,
        level,
        text,
        pos,
      });
    }
  });

  return headings;
}

function headings_equal(a: OutlineHeading[], b: OutlineHeading[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const ah = a[i];
    const bh = b[i];
    if (!ah || !bh) return false;
    if (ah.level !== bh.level || ah.text !== bh.text || ah.pos !== bh.pos) {
      return false;
    }
  }
  return true;
}

export function create_outline_prose_plugin(): Plugin<OutlinePluginState> {
  return new Plugin<OutlinePluginState>({
    key: outline_plugin_key,
    state: {
      init(_config, state) {
        return { headings: extract_headings(state.doc) };
      },
      apply(tr, plugin_state, _old_state, new_state) {
        if (!tr.docChanged) return plugin_state;

        const headings = extract_headings(new_state.doc);
        if (headings_equal(headings, plugin_state.headings)) {
          return plugin_state;
        }
        return { headings };
      },
    },
  });
}
