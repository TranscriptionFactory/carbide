import { $prose } from "@milkdown/kit/utils";
import { Plugin, PluginKey } from "@milkdown/kit/prose/state";

interface TypographyRule {
  trigger: string;
  pattern: string;
  replacement: string;
}

const TYPOGRAPHY_RULES: TypographyRule[] = [
  { trigger: ">", pattern: "-->", replacement: "\u2192" },
  { trigger: ">", pattern: "==>", replacement: "\u21D2" },
  { trigger: "-", pattern: "<--", replacement: "\u2190" },
  { trigger: "=", pattern: "<==", replacement: "\u21D0" },
  { trigger: ">", pattern: "<->", replacement: "\u2194" },
  { trigger: ">", pattern: "<=>", replacement: "\u21D4" },
];

export function find_typography_match(
  text_before: string,
  typed_char: string,
): { from_offset: number; replacement: string } | null {
  const full = text_before + typed_char;

  for (const rule of TYPOGRAPHY_RULES) {
    if (typed_char !== rule.trigger) continue;
    if (!full.endsWith(rule.pattern)) continue;

    return {
      from_offset: full.length - rule.pattern.length,
      replacement: rule.replacement,
    };
  }

  return null;
}

export const typography_plugin_key = new PluginKey("typography");

export const typography_plugin = $prose(
  () =>
    new Plugin({
      key: typography_plugin_key,
      props: {
        handleTextInput(view, from, to, text) {
          if (text.length !== 1) return false;

          const { state } = view;
          const $from = state.doc.resolve(from);
          const parent = $from.parent;

          if (parent.type.name === "code_block") return false;
          if (parent.type.name === "math_block") return false;

          const text_before = parent.textBetween(
            0,
            $from.parentOffset,
            undefined,
            "\ufffc",
          );

          const match = find_typography_match(text_before, text);
          if (!match) return false;

          const parent_start = $from.start();
          const replace_from = parent_start + match.from_offset;
          const replace_to = to;
          const tr = state.tr.replaceWith(
            replace_from,
            replace_to,
            state.schema.text(match.replacement),
          );
          view.dispatch(tr);
          return true;
        },
      },
    }),
);
