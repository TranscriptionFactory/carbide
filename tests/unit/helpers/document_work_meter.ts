import { Node as PmNode } from "prosemirror-model";
import type { Node as ProseNode } from "prosemirror-model";

export type WorkCounters = { nodes: number; chars: number };

/**
 * Counts the document work code performs, as document positions instead of
 * plugin callbacks: nodes visited through `nodesBetween` (which `descendants`
 * is built on) and characters read out of text nodes.
 *
 * `TextNode` keeps its text in an own property, so the meter swaps in a
 * prototype accessor for `text` and re-homes the existing own properties; that
 * catches the reads of every node, including ones the transaction creates.
 */
export function meter_document_work(doc?: ProseNode): {
  counters: WorkCounters;
  stop: () => WorkCounters;
} {
  const counters: WorkCounters = { nodes: 0, chars: 0 };

  // The casts only let the test write to the prototype members; the real
  // signatures are preserved.
  const patch = PmNode.prototype as unknown as {
    text?: string;
    nodesBetween: (
      this: PmNode,
      from: number,
      to: number,
      visit: (node: PmNode, pos: number) => unknown,
      nodeStart?: number,
      parent?: PmNode | null,
    ) => void;
  };
  const original_nodes_between = patch.nodesBetween;
  patch.nodesBetween = function (
    this: PmNode,
    from,
    to,
    visit,
    nodeStart,
    parent,
  ) {
    original_nodes_between.call(
      this,
      from,
      to,
      (node: PmNode, pos: number) => {
        counters.nodes += 1;
        return visit(node, pos);
      },
      nodeStart,
      parent,
    );
  };

  const backing = new Map<PmNode, string>();
  const text_descriptor = Object.getOwnPropertyDescriptor(
    PmNode.prototype,
    "text",
  );
  Object.defineProperty(PmNode.prototype, "text", {
    configurable: true,
    get(this: PmNode) {
      const value = backing.get(this);
      if (value === undefined) return undefined;
      counters.chars += value.length;
      return value;
    },
    set(this: PmNode, value: string) {
      backing.set(this, value);
    },
  });

  const harvest = (node: ProseNode) => {
    node.forEach((child) => {
      if (!child.isText) {
        harvest(child);
        return;
      }
      if (Object.hasOwn(child, "text")) {
        backing.set(child, child.text ?? "");
        Reflect.deleteProperty(child, "text");
      }
    });
  };
  if (doc) harvest(doc);

  return {
    counters,
    stop: () => {
      patch.nodesBetween = original_nodes_between;
      if (text_descriptor) {
        Object.defineProperty(PmNode.prototype, "text", text_descriptor);
      } else {
        Reflect.deleteProperty(PmNode.prototype, "text");
      }
      for (const [node, value] of backing) {
        Object.defineProperty(node, "text", {
          configurable: true,
          writable: true,
          enumerable: true,
          value,
        });
      }
      return counters;
    },
  };
}
