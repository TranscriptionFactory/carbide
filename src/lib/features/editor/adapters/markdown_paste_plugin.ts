import { Plugin } from "prosemirror-state";
import { Slice } from "prosemirror-model";
import { pick_paste_mode } from "./markdown_paste_utils";

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
        if (mode !== "markdown") return false;

        const source = (
          text_markdown.trim() !== "" ? text_markdown : text_plain
        ).replace(/\r\n/g, "\n");
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
        const open_depth = is_single_textblock ? 1 : 0;

        view.dispatch(
          view.state.tr.replaceSelection(
            new Slice(doc.content, open_depth, open_depth),
          ),
        );
        return true;
      },
    },
  });
}
