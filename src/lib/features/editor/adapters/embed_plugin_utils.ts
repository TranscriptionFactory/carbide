import type { Node as ProseNode } from "prosemirror-model";
import type { PluginKey } from "prosemirror-state";

export function collect_paragraph_text(node: ProseNode): string | null {
  let text = "";
  let has_non_text = false;

  node.descendants((child: ProseNode) => {
    if (child.isText && child.text) {
      text += child.text;
      return true;
    }
    if (child.isInline) {
      has_non_text = true;
      return false;
    }
    return true;
  });

  if (has_non_text || text.length === 0) return null;
  return text;
}

export function is_full_scan_meta(
  key: PluginKey,
  transactions: readonly { getMeta(key: PluginKey): unknown }[],
): boolean {
  return transactions.some((tr) => {
    const meta = tr.getMeta(key);
    if (typeof meta !== "object" || meta === null) return false;
    return (meta as Record<string, unknown>).action === "full_scan";
  });
}
