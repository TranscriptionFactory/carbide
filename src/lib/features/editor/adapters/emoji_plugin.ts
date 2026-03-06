import { $prose } from "@milkdown/kit/utils";
import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import { get } from "node-emoji";

const SHORTCODE_REGEX = /^[a-zA-Z0-9_+-]+$/;

export function extract_emoji_shortcode(
  text: string,
  to: number,
): { shortcode: string; from: number } | null {
  const before = text.slice(0, to);
  if (!before.endsWith(":")) return null;

  const inner = before.slice(0, -1);
  const colon_idx = inner.lastIndexOf(":");
  if (colon_idx === -1) return null;

  const shortcode = inner.slice(colon_idx + 1);
  if (!shortcode || !SHORTCODE_REGEX.test(shortcode)) return null;

  return { shortcode, from: colon_idx };
}

export const emoji_plugin_key = new PluginKey("emoji-shortcode");

export const emoji_plugin = $prose(
  () =>
    new Plugin({
      key: emoji_plugin_key,
      props: {
        handleTextInput(view, from, to, text) {
          if (text !== ":") return false;

          const { state } = view;
          const $from = state.doc.resolve(from);

          if ($from.parent.type.name === "code_block") return false;

          const text_before = $from.parent.textBetween(
            0,
            $from.parentOffset,
            undefined,
            "\ufffc",
          );

          const match = extract_emoji_shortcode(
            text_before + ":",
            text_before.length + 1,
          );
          if (!match) return false;

          const emoji = get(match.shortcode);
          if (!emoji) return false;

          const parent_start = $from.start();
          const replace_from = parent_start + match.from;
          const replace_to = to;
          const tr = state.tr.replaceWith(
            replace_from,
            replace_to,
            state.schema.text(emoji),
          );
          view.dispatch(tr);
          return true;
        },
      },
    }),
);
