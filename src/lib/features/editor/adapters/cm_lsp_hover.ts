import { ViewPlugin, type EditorView } from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import { computePosition, flip, shift, offset } from "@floating-ui/dom";
import { render_lsp_markdown } from "./lsp_tooltip_renderer";
import { line_character_from_md_offset } from "./lsp_plugin_utils";
import type { EditorService } from "../application/editor_service";

export function create_cm_lsp_hover(
  editor_service: EditorService,
  options?: {
    on_hover_result?: (result: { contents: string; line: number; character: number } | null) => void;
  },
): Extension {
  return ViewPlugin.define((editor_view: EditorView) => {
    let hover_timeout: ReturnType<typeof setTimeout> | null = null;
    let active_range: { from: number; to: number } | null = null;
    let hovering_tooltip = false;
    let hover_gen = 0;
    let show_timestamp = 0;

    const container = document.createElement("div");
    container.className = "lsp-hover-tooltip";
    container.style.display = "none";
    container.style.position = "fixed";
    container.style.zIndex = "9998";
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

    function word_range_at(pos: number): { from: number; to: number } {
      const word = editor_view.state.wordAt(pos);
      return word ?? { from: pos, to: pos };
    }

    function hide() {
      if (hovering_tooltip) return;
      container.style.display = "none";
      container.innerHTML = "";
      active_range = null;
    }

    function show(pos: number, contents: string) {
      container.innerHTML = "";
      const header = document.createElement("span");
      header.style.fontSize = "10px";
      header.style.textTransform = "uppercase";
      header.style.letterSpacing = "0.05em";
      header.style.color = "var(--muted-foreground)";
      header.style.display = "block";
      header.style.marginBottom = "4px";
      header.textContent = "LSP";
      container.appendChild(header);
      const body = document.createElement("div");
      body.className = "lsp-hover-content";
      body.innerHTML = render_lsp_markdown(contents);
      container.appendChild(body);
      container.style.display = "block";
      active_range = word_range_at(pos);
      show_timestamp = Date.now();

      const coords = editor_view.coordsAtPos(pos);
      if (!coords) return;
      const rect = new DOMRect(
        coords.left,
        coords.top,
        1,
        coords.bottom - coords.top,
      );
      const virtual_el = { getBoundingClientRect: () => rect };

      void computePosition(virtual_el as Element, container, {
        placement: "bottom-start",
        middleware: [offset(6), flip(), shift({ padding: 8 })],
      }).then(({ x, y }) => {
        container.style.left = `${String(x)}px`;
        container.style.top = `${String(y)}px`;
      });
    }

    function on_mousemove(event: MouseEvent) {
      if (hover_timeout) clearTimeout(hover_timeout);

      const pos = editor_view.posAtCoords({
        x: event.clientX,
        y: event.clientY,
      });
      if (pos == null) {
        if (!hovering_tooltip) hide();
        return;
      }
      if (active_range && pos >= active_range.from && pos <= active_range.to)
        return;
      if (Date.now() - show_timestamp < 100) return;

      hover_timeout = setTimeout(() => {
        const gen = ++hover_gen;
        const markdown = editor_view.state.doc.toString();
        const { line, character } = line_character_from_md_offset(
          markdown,
          pos,
        );
        void editor_service.lsp_hover(line, character).then((result) => {
          if (gen !== hover_gen) return;
          if (!result?.contents) {
            if (!hovering_tooltip) hide();
            return;
          }
          show(pos, result.contents);
          options?.on_hover_result?.({ contents: result.contents, line, character });
        });
      }, 350);
    }

    function on_mouseleave() {
      if (hover_timeout) clearTimeout(hover_timeout);
      hover_gen++;
      setTimeout(() => {
        if (!hovering_tooltip) hide();
      }, 100);
    }

    editor_view.dom.addEventListener("mousemove", on_mousemove);
    editor_view.dom.addEventListener("mouseleave", on_mouseleave);

    return {
      destroy() {
        if (hover_timeout) clearTimeout(hover_timeout);
        editor_view.dom.removeEventListener("mousemove", on_mousemove);
        editor_view.dom.removeEventListener("mouseleave", on_mouseleave);
        container.remove();
      },
    };
  });
}
