import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import type { Node as ProseNode } from "prosemirror-model";
import type { HighlighterCore } from "shiki/core";
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
  code_fingerprint: string;
};

function compute_code_fingerprint(doc: ProseNode): string {
  const parts: string[] = [];
  doc.descendants((node) => {
    if (node.type.name === "code_block") {
      parts.push((node.attrs.language as string) || "");
      parts.push(node.textContent);
    }
  });
  return parts.join("\0");
}

function build_decorations(
  doc: ProseNode,
  highlighter: HighlighterCore,
  theme: string,
): DecorationSet {
  const decorations: Decoration[] = [];

  doc.descendants((node, pos) => {
    if (node.type.name !== "code_block") return;

    const code = node.textContent;
    if (!code) return;

    const raw_lang = node.attrs.language as string | null | undefined;
    const lang = resolve_language(raw_lang);
    if (!lang) return;

    try {
      const { tokens } = highlighter.codeToTokens(code, {
        lang,
        theme,
      });

      let offset = pos + 1;

      for (let line_idx = 0; line_idx < tokens.length; line_idx++) {
        const line = tokens[line_idx]!;
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
  });

  return DecorationSet.create(doc, decorations);
}

export function create_shiki_prose_plugin(): Plugin {
  let theme_observer: MutationObserver | null = null;

  return new Plugin({
    key: shiki_plugin_key,

    state: {
      init(_, { doc }): ShikiPluginState {
        const highlighter = get_highlighter_sync();
        const theme = resolve_theme();
        const fp = compute_code_fingerprint(doc);
        if (!highlighter) {
          return {
            decorations: DecorationSet.empty,
            theme,
            code_fingerprint: fp,
          };
        }
        return {
          theme,
          decorations: build_decorations(doc, highlighter, theme),
          code_fingerprint: fp,
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
          const fp = compute_code_fingerprint(tr.doc);
          return {
            theme,
            decorations: build_decorations(tr.doc, highlighter, theme),
            code_fingerprint: fp,
          };
        }

        const new_fp = compute_code_fingerprint(tr.doc);
        if (new_fp === prev_state.code_fingerprint) {
          return {
            ...prev_state,
            decorations: prev_state.decorations.map(tr.mapping, tr.doc),
          };
        }

        return {
          theme,
          decorations: build_decorations(tr.doc, highlighter, theme),
          code_fingerprint: new_fp,
        };
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
