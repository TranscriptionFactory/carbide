import { Plugin, PluginKey } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { computePosition, flip, shift, offset } from "@floating-ui/dom";
import type { MarkdownLspHoverResult } from "$lib/features/markdown_lsp";
import { line_and_character_from_pos } from "./lsp_plugin_utils";

type LspHoverPluginState = {
  trigger_at_pos: (pos: number) => void;
};

const lsp_hover_plugin_key = new PluginKey<LspHoverPluginState>("lsp-hover");

function pos_to_dom_rect(view: EditorView, from: number, to: number): DOMRect {
  const start = view.coordsAtPos(from);
  const end = view.coordsAtPos(to);
  const top = Math.min(start.top, end.top);
  const bottom = Math.max(start.bottom, end.bottom);
  const left = Math.min(start.left, end.left);
  const right = Math.max(start.right, end.right);
  return new DOMRect(left, top, right - left, bottom - top);
}

export function trigger_lsp_hover(view: EditorView, pos: number): void {
  const plugin_state = lsp_hover_plugin_key.getState(view.state);
  plugin_state?.trigger_at_pos(pos);
}

export function create_lsp_hover_plugin(input: {
  on_hover: (
    line: number,
    character: number,
  ) => Promise<MarkdownLspHoverResult | null>;
  on_hover_result?: (
    result: { contents: string; line: number; character: number } | null,
  ) => void;
}): Plugin {
  return new Plugin({
    key: lsp_hover_plugin_key,
    state: {
      init(): LspHoverPluginState {
        return { trigger_at_pos: () => {} };
      },
      apply(_tr, value): LspHoverPluginState {
        return value;
      },
    },
    view(editor_view) {
      let hover_timeout: ReturnType<typeof setTimeout> | null = null;
      let active_pos: number | null = null;
      let hovering_tooltip = false;

      const container = document.createElement("div");
      container.className = "lsp-hover-tooltip";
      container.style.display = "none";
      container.style.position = "fixed";
      container.style.zIndex = "9999";
      container.style.maxWidth = "400px";
      container.style.padding = "8px 12px";
      container.style.borderRadius = "6px";
      container.style.fontSize = "13px";
      container.style.lineHeight = "1.5";
      container.style.backgroundColor = "var(--popover)";
      container.style.color = "var(--popover-foreground)";
      container.style.border = "1px solid var(--border)";
      container.style.boxShadow = "0 2px 8px rgba(0,0,0,0.15)";
      container.style.whiteSpace = "pre-wrap";
      container.style.wordBreak = "break-word";
      container.style.pointerEvents = "auto";
      document.body.appendChild(container);

      container.addEventListener("mouseenter", () => {
        hovering_tooltip = true;
      });
      container.addEventListener("mouseleave", () => {
        hovering_tooltip = false;
        hide();
      });

      function hide() {
        if (hovering_tooltip) return;
        container.style.display = "none";
        container.textContent = "";
        active_pos = null;
        input.on_hover_result?.(null);
      }

      function show(view: EditorView, pos: number, contents: string) {
        container.textContent = contents;
        container.style.display = "block";
        active_pos = pos;

        const { line, character } = line_and_character_from_pos(view, pos);
        input.on_hover_result?.({ contents, line, character });

        const rect = pos_to_dom_rect(view, pos, pos + 1);
        const virtual_el = { getBoundingClientRect: () => rect };

        void computePosition(virtual_el as Element, container, {
          placement: "bottom-start",
          middleware: [offset(6), flip(), shift({ padding: 8 })],
        }).then(({ x, y }) => {
          container.style.left = `${String(x)}px`;
          container.style.top = `${String(y)}px`;
        });
      }

      function trigger_at_pos(pos: number) {
        const { line, character } = line_and_character_from_pos(
          editor_view,
          pos,
        );
        void input.on_hover(line, character).then((result) => {
          if (!result?.contents) {
            if (!hovering_tooltip) hide();
            return;
          }
          show(editor_view, pos, result.contents);
        });
      }

      const plugin_state = lsp_hover_plugin_key.getState(editor_view.state);
      if (plugin_state) {
        plugin_state.trigger_at_pos = trigger_at_pos;
      }

      async function on_mousemove(event: MouseEvent) {
        if (hover_timeout) clearTimeout(hover_timeout);

        const coords = { left: event.clientX, top: event.clientY };
        const pos_result = editor_view.posAtCoords(coords);
        if (!pos_result) {
          if (!hovering_tooltip) hide();
          return;
        }

        const pos = pos_result.pos;
        if (pos === active_pos) return;

        hover_timeout = setTimeout(() => {
          trigger_at_pos(pos);
        }, 350);
      }

      function on_mouseleave() {
        if (hover_timeout) clearTimeout(hover_timeout);
        setTimeout(() => {
          if (!hovering_tooltip) hide();
        }, 100);
      }

      editor_view.dom.addEventListener("mousemove", on_mousemove);
      editor_view.dom.addEventListener("mouseleave", on_mouseleave);

      return {
        update() {},
        destroy() {
          if (hover_timeout) clearTimeout(hover_timeout);
          editor_view.dom.removeEventListener("mousemove", on_mousemove);
          editor_view.dom.removeEventListener("mouseleave", on_mouseleave);
          container.remove();
        },
      };
    },
  });
}
