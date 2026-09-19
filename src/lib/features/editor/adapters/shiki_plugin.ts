import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import type { Node as ProseNode } from "prosemirror-model";
import type { HighlighterCore } from "shiki/core";
import { changed_range } from "./incremental_scan";
import {
  get_highlighter_sync,
  resolve_language,
  resolve_theme,
  load_shiki_theme,
} from "./shiki_highlighter";

export const shiki_plugin_key = new PluginKey<ShikiPluginState>(
  "shiki-highlight",
);

type ShikiPluginState = {
  decorations: DecorationSet;
  theme: string;
};

function build_block_decorations(
  node: ProseNode,
  pos: number,
  highlighter: HighlighterCore,
  theme: string,
): Decoration[] {
  const decorations: Decoration[] = [];

  const code = node.textContent;
  if (!code) return decorations;

  const raw_lang = node.attrs.language as string | null | undefined;
  const lang = resolve_language(raw_lang);
  if (!lang) return decorations;

  try {
    const { tokens } = highlighter.codeToTokens(code, {
      lang,
      theme,
    });

    let offset = pos + 1;

    for (let line_idx = 0; line_idx < tokens.length; line_idx++) {
      const line = tokens[line_idx];
      if (!line) continue;
      for (const token of line) {
        const from = offset;
        const to = from + token.content.length;

        if (token.color) {
          let style = `color:${token.color}`;
          if (token.fontStyle !== undefined && token.fontStyle & 1) {
            style += ";font-style:italic";
          }
          if (token.fontStyle !== undefined && token.fontStyle & 2) {
            style += ";font-weight:bold";
          }
          decorations.push(Decoration.inline(from, to, { style }));
        }

        offset = to;
      }
      if (line_idx < tokens.length - 1) {
        offset += 1;
      }
    }
  } catch {
    // unsupported language or parse error — fall back to unstyled
  }

  return decorations;
}

function build_decorations(
  doc: ProseNode,
  highlighter: HighlighterCore,
  theme: string,
): DecorationSet {
  const decorations: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== "code_block") return;
    for (const d of build_block_decorations(node, pos, highlighter, theme)) {
      decorations.push(d);
    }
  });
  return DecorationSet.create(doc, decorations);
}

function code_blocks_in_range(
  doc: ProseNode,
  from: number,
  to: number,
): Array<{ pos: number; node: ProseNode }> {
  const blocks: Array<{ pos: number; node: ProseNode }> = [];
  doc.nodesBetween(from, to, (node, pos) => {
    if (node.type.name !== "code_block") return;
    blocks.push({ pos, node });
    return false;
  });
  return blocks;
}

export function create_shiki_prose_plugin(): Plugin {
  let theme_observer: MutationObserver | null = null;

  return new Plugin({
    key: shiki_plugin_key,

    state: {
      init(_, { doc }): ShikiPluginState {
        const highlighter = get_highlighter_sync();
        const theme = resolve_theme();
        if (!highlighter) {
          return { decorations: DecorationSet.empty, theme };
        }
        return {
          theme,
          decorations: build_decorations(doc, highlighter, theme),
        };
      },

      apply(tr, prev_state): ShikiPluginState {
        const meta = tr.getMeta(shiki_plugin_key) as
          | Partial<ShikiPluginState>
          | undefined;
        const theme = meta?.theme ?? prev_state.theme;
        const theme_refreshed = meta?.theme !== undefined;

        if (!tr.docChanged && !theme_refreshed) {
          return prev_state;
        }

        const highlighter = get_highlighter_sync();
        if (!highlighter) {
          return {
            ...prev_state,
            theme,
            decorations: prev_state.decorations.map(tr.mapping, tr.doc),
          };
        }

        if (theme_refreshed) {
          return {
            theme,
            decorations: build_decorations(tr.doc, highlighter, theme),
          };
        }

        let decorations = prev_state.decorations.map(tr.mapping, tr.doc);
        const range = changed_range(tr);
        if (range) {
          for (const block of code_blocks_in_range(
            tr.doc,
            range.from,
            range.to,
          )) {
            const stale = decorations.find(
              block.pos,
              block.pos + block.node.nodeSize,
            );
            const fresh = build_block_decorations(
              block.node,
              block.pos,
              highlighter,
              theme,
            );
            decorations = decorations.remove(stale).add(tr.doc, fresh);
          }
        }

        return { theme, decorations };
      },
    },

    props: {
      decorations(state) {
        return shiki_plugin_key.getState(state)?.decorations;
      },
    },

    view(editor_view) {
      let destroyed = false;

      function load_and_apply(theme_name: string) {
        void load_shiki_theme(theme_name).then((loaded) => {
          if (!loaded || destroyed) return;
          const tr = editor_view.state.tr.setMeta(shiki_plugin_key, {
            theme: theme_name,
          });
          editor_view.dispatch(tr);
        });
      }

      const initial_theme = resolve_theme();
      const initial_state = shiki_plugin_key.getState(editor_view.state);
      if (
        initial_state &&
        initial_state.decorations === DecorationSet.empty &&
        initial_theme
      ) {
        load_and_apply(initial_theme);
      }

      theme_observer = new MutationObserver(() => {
        const new_theme = resolve_theme();
        const current = shiki_plugin_key.getState(editor_view.state);
        if (current && current.theme !== new_theme) {
          load_and_apply(new_theme);
        }
      });

      theme_observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-color-scheme", "data-shiki-theme"],
      });

      return {
        destroy() {
          destroyed = true;
          theme_observer?.disconnect();
          theme_observer = null;
        },
      };
    },
  });
}
