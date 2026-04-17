import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet, type EditorView } from "prosemirror-view";
import { computePosition, offset, flip, shift } from "@floating-ui/dom";
import type { Diagnostic } from "$lib/features/diagnostics";
import { offset_for_line_character } from "./lsp_plugin_utils";

export const diagnostics_decoration_plugin_key = new PluginKey<DecorationSet>(
  "diagnostics_decoration",
);

const SEVERITY_CLASS: Record<string, string> = {
  error: "diagnostic-error",
  warning: "diagnostic-warning",
  info: "diagnostic-info",
  hint: "diagnostic-hint",
};

function build_decorations(
  view: EditorView,
  diagnostics: Diagnostic[],
): DecorationSet {
  if (diagnostics.length === 0) return DecorationSet.empty;

  const doc = view.state.doc;
  const doc_text = doc.textBetween(0, doc.content.size, "\n");
  const decorations: Decoration[] = [];

  for (const diag of diagnostics) {
    const from_offset = offset_for_line_character(
      doc_text,
      diag.line,
      diag.column,
    );
    const to_offset = offset_for_line_character(
      doc_text,
      diag.end_line,
      diag.end_column,
    );

    const from = Math.min(from_offset + 1, doc.content.size);
    let to = Math.min(to_offset + 1, doc.content.size);
    if (to <= from) to = Math.min(from + 1, doc.content.size);

    const css_class = SEVERITY_CLASS[diag.severity] ?? "diagnostic-info";
    decorations.push(
      Decoration.inline(
        from,
        to,
        { class: css_class },
        {
          diagnostic_message: diag.message,
          diagnostic_severity: diag.severity,
        },
      ),
    );
  }

  return DecorationSet.create(doc, decorations);
}

export function update_prosemirror_diagnostics(
  view: EditorView,
  diagnostics: Diagnostic[],
) {
  const deco_set = build_decorations(view, diagnostics);
  view.dispatch(
    view.state.tr.setMeta(diagnostics_decoration_plugin_key, deco_set),
  );
}

export function create_diagnostics_decoration_plugin(): Plugin {
  let tooltip: HTMLDivElement | null = null;
  let hover_timeout: ReturnType<typeof setTimeout> | null = null;
  let hovering_tooltip = false;

  return new Plugin({
    key: diagnostics_decoration_plugin_key,

    state: {
      init: () => DecorationSet.empty,
      apply(tr, prev) {
        const meta = tr.getMeta(diagnostics_decoration_plugin_key) as
          | DecorationSet
          | undefined;
        if (meta !== undefined) return meta;
        if (tr.docChanged) return prev.map(tr.mapping, tr.doc);
        return prev;
      },
    },

    props: {
      decorations(state) {
        return (
          diagnostics_decoration_plugin_key.getState(state) ??
          DecorationSet.empty
        );
      },
    },

    view(editor_view) {
      tooltip = document.createElement("div");
      tooltip.className = "diagnostic-tooltip";
      tooltip.style.display = "none";
      tooltip.style.position = "fixed";
      tooltip.style.zIndex = "9999";
      tooltip.style.maxWidth = "400px";
      tooltip.style.padding = "6px 10px";
      tooltip.style.borderRadius = "6px";
      tooltip.style.fontSize = "12px";
      tooltip.style.lineHeight = "1.4";
      tooltip.style.backgroundColor = "var(--popover)";
      tooltip.style.color = "var(--popover-foreground)";
      tooltip.style.border = "1px solid var(--border)";
      tooltip.style.boxShadow = "0 2px 8px rgba(0,0,0,0.15)";
      tooltip.style.whiteSpace = "pre-wrap";
      tooltip.style.wordBreak = "break-word";
      tooltip.style.pointerEvents = "auto";
      document.body.appendChild(tooltip);

      const tooltip_el = tooltip;

      tooltip_el.addEventListener("mouseenter", () => {
        hovering_tooltip = true;
      });
      tooltip_el.addEventListener("mouseleave", () => {
        hovering_tooltip = false;
        hide_tooltip();
      });

      function hide_tooltip() {
        if (hovering_tooltip) return;
        tooltip_el.style.display = "none";
        tooltip_el.textContent = "";
      }

      function show_tooltip(view: EditorView, pos: number, message: string) {
        tooltip_el.textContent = message;
        tooltip_el.style.display = "block";

        const coords = view.coordsAtPos(pos);
        const virtual_el = {
          getBoundingClientRect: () =>
            new DOMRect(coords.left, coords.top, 1, coords.bottom - coords.top),
        };

        void computePosition(virtual_el as Element, tooltip_el, {
          placement: "bottom-start",
          middleware: [offset(6), flip(), shift({ padding: 8 })],
        }).then(({ x, y }) => {
          tooltip_el.style.left = `${String(x)}px`;
          tooltip_el.style.top = `${String(y)}px`;
        });
      }

      function on_mousemove(event: MouseEvent) {
        if (hover_timeout) clearTimeout(hover_timeout);

        hover_timeout = setTimeout(() => {
          const coords = { left: event.clientX, top: event.clientY };
          const pos_result = editor_view.posAtCoords(coords);
          if (!pos_result) {
            if (!hovering_tooltip) hide_tooltip();
            return;
          }

          const deco_set = diagnostics_decoration_plugin_key.getState(
            editor_view.state,
          );
          if (!deco_set) {
            if (!hovering_tooltip) hide_tooltip();
            return;
          }

          const decos_at_pos = deco_set.find(
            pos_result.pos,
            pos_result.pos + 1,
          );
          if (decos_at_pos.length === 0) {
            if (!hovering_tooltip) hide_tooltip();
            return;
          }

          const messages = decos_at_pos
            .map(
              (d) =>
                (d.spec as { diagnostic_message?: string })?.diagnostic_message,
            )
            .filter(Boolean);

          if (messages.length > 0) {
            show_tooltip(editor_view, pos_result.pos, messages.join("\n\n"));
          } else {
            if (!hovering_tooltip) hide_tooltip();
          }
        }, 300);
      }

      function on_mouseleave() {
        if (hover_timeout) clearTimeout(hover_timeout);
        setTimeout(() => {
          if (!hovering_tooltip) hide_tooltip();
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
          tooltip_el.remove();
        },
      };
    },
  });
}
