import { Plugin, PluginKey } from "prosemirror-state";
import type { Transaction } from "prosemirror-state";
import { ReplaceStep } from "prosemirror-transform";
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

export function active_heading_at(
  headings: OutlineHeading[],
  pos: number,
): string | null {
  let active: string | null = null;
  for (const h of headings) {
    if (h.pos > pos) break;
    active = h.id;
  }
  return active;
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
export function map_headings_forward(
  tr: Transaction,
  prev_headings: OutlineHeading[],
  new_doc: ProseNode,
): OutlineHeading[] | null {
  const mapped: OutlineHeading[] = [];
  let prev_pos = -1;

  for (const h of prev_headings) {
    const pos = tr.mapping.map(h.pos, 1);
    if (pos <= prev_pos) return null;

    const node = new_doc.nodeAt(pos);
    if (
      node?.type.name !== "heading" ||
      (node.attrs.level as number | undefined) !== h.level ||
      node.textContent !== h.text
    ) {
      return null;
    }

    mapped.push({ ...h, pos });
    prev_pos = pos;
  }

  if (transaction_inserts_heading(tr)) return null;
  return mapped;
}

function transaction_inserts_heading(tr: Transaction): boolean {
  for (const step of tr.steps) {
    if (!(step instanceof ReplaceStep)) continue;

    let found = false;
    step.slice.content.descendants((node) => {
      if (node.type.name === "heading") {
        found = true;
        return false;
      }
      return true;
    });
    if (found) return true;
  }
  return false;
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

        const mapped = map_headings_forward(
          tr,
          plugin_state.headings,
          new_state.doc,
        );
        if (mapped !== null) {
          if (headings_equal(mapped, plugin_state.headings))
            return plugin_state;
          return { headings: mapped };
        }

        const headings = extract_headings(new_state.doc);
        if (headings_equal(headings, plugin_state.headings)) {
          return plugin_state;
        }
        return { headings };
      },
    },
  });
}
