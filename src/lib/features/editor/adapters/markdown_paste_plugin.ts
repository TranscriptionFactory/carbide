import { Plugin } from "prosemirror-state";
import { Slice } from "prosemirror-model";
import type { Node } from "prosemirror-model";
import { pick_paste_mode } from "./markdown_paste_utils";
import { html_to_markdown } from "$lib/shared/html";

function is_list_node(node: Node): boolean {
  return node.type.name === "bullet_list" || node.type.name === "ordered_list";
}

function is_single_flat_list_item(content: Slice["content"]): boolean {
  if (content.childCount !== 1) return false;
  const list = content.firstChild;
  if (list === null || !is_list_node(list)) return false;
  if (list.childCount !== 1) return false;
  const item = list.firstChild;
  if (item === null || item.type.name !== "list_item") return false;
  let has_nested_list = false;
  item.content.forEach((child) => {
    if (is_list_node(child)) has_nested_list = true;
  });
  return !has_nested_list;
}

function is_single_list_block(content: Slice["content"]): boolean {
  if (content.childCount !== 1) return false;
  const list = content.firstChild;
  return list !== null && is_list_node(list);
}

export function create_markdown_paste_prose_plugin(
  parse_fn: (markdown: string) => { content: Slice["content"] },
): Plugin {
  return new Plugin({
    props: {
      handlePaste: (view, event) => {
        const editable = view.props.editable?.(view.state);
        const { clipboardData } = event;
        if (!editable || !clipboardData) return false;

        const current_node = view.state.selection.$from.node();
        if (current_node.type.spec.code) return false;

        const text_markdown = clipboardData.getData("text/markdown");
        const text_plain = clipboardData.getData("text/plain");
        const text_html = clipboardData.getData("text/html");

        const mode = pick_paste_mode({ text_markdown, text_plain, text_html });
        if (mode === "none") return false;

        if (mode === "url") {
          const url = text_plain.trim();
          const link_mark = view.state.schema.marks.link;
          if (!link_mark) return false;
          const mark = link_mark.create({ href: url });
          const text_node = view.state.schema.text(url, [mark]);
          const tr = view.state.tr.replaceSelectionWith(text_node, false);
          view.dispatch(tr);
          return true;
        }

        if (mode !== "markdown" && mode !== "html") return false;

        let source: string;
        if (mode === "html") {
          try {
            source = html_to_markdown(text_html).replace(/\r\n/g, "\n");
          } catch {
            return false;
          }
        } else {
          source = (
            text_markdown.trim() !== "" ? text_markdown : text_plain
          ).replace(/\r\n/g, "\n");
        }
        if (source.trim() === "") return false;

        let doc: ReturnType<typeof parse_fn>;
        try {
          doc = parse_fn(source);
        } catch {
          return false;
        }

        const is_single_textblock =
          doc.content.childCount === 1 &&
          doc.content.firstChild !== null &&
          doc.content.firstChild.isTextblock;

        const $from = view.state.selection.$from;
        const cursor_in_list = $from.depth > 0 && is_list_node($from.node(-1));

        let open_depth: number;
        if (is_single_textblock) {
          open_depth = 1;
        } else if (is_single_flat_list_item(doc.content)) {
          open_depth = 2;
        } else if (cursor_in_list && is_single_list_block(doc.content)) {
          open_depth = 2;
        } else {
          open_depth = 0;
        }

        try {
          view.dispatch(
            view.state.tr.replaceSelection(
              new Slice(doc.content, open_depth, open_depth),
            ),
          );
        } catch {
          try {
            const paragraph_type = view.state.schema.nodes.paragraph;
            if (!paragraph_type) return false;
            const text_node = view.state.schema.text(source);
            const paragraph = paragraph_type.create(null, text_node);
            view.dispatch(view.state.tr.replaceSelectionWith(paragraph, false));
          } catch {
            return false;
          }
        }
        return true;
      },
    },
  });
}
