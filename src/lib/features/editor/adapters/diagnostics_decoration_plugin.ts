import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet, type EditorView } from "prosemirror-view";
import { computePosition, offset, flip, shift } from "@floating-ui/dom";
import type { Diagnostic, DiagnosticSource } from "$lib/features/diagnostics";
import { lsp_pos_to_prose_pos } from "./lsp_plugin_utils";
import { render_lsp_markdown } from "./lsp_tooltip_renderer";

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
  get_markdown: () => string,
): DecorationSet {
  if (diagnostics.length === 0) return DecorationSet.empty;

  const doc = view.state.doc;
  const markdown = get_markdown();
  const decorations: Decoration[] = [];

  for (const diag of diagnostics) {
    const from = lsp_pos_to_prose_pos(doc, markdown, diag.line, diag.column);
    const to_raw = lsp_pos_to_prose_pos(
      doc,
      markdown,
      diag.end_line,
      diag.end_column,
    );

    const from_clamped = Math.min(Math.max(from, 1), doc.content.size);
    let to_clamped = Math.min(Math.max(to_raw, 1), doc.content.size);
    if (to_clamped <= from_clamped)
      to_clamped = Math.min(from_clamped + 1, doc.content.size);

    const css_class = SEVERITY_CLASS[diag.severity] ?? "diagnostic-info";
    decorations.push(
      Decoration.inline(
        from_clamped,
        to_clamped,
        { class: css_class },
        {
          diagnostic_message: diag.message,
          diagnostic_severity: diag.severity,
          diagnostic_source: diag.source,
        },
      ),
    );
  }

  return DecorationSet.create(doc, decorations);
}

let diagnostics_get_markdown: (() => string) | null = null;

export function update_prosemirror_diagnostics(
  view: EditorView,
  diagnostics: Diagnostic[],
) {
  const get_md = diagnostics_get_markdown ?? (() => "");
  const deco_set = build_decorations(view, diagnostics, get_md);
  view.dispatch(
    view.state.tr.setMeta(diagnostics_decoration_plugin_key, deco_set),
  );
}

export function create_diagnostics_decoration_plugin(
  get_markdown?: () => string,
): Plugin {
  let tooltip: HTMLDivElement | null = null;
  let hover_timeout: ReturnType<typeof setTimeout> | null = null;
  let hovering_tooltip = false;

  if (get_markdown) {
    diagnostics_get_markdown = get_markdown;
  }

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
        tooltip_el.innerHTML = "";
      }

      function source_label(source: DiagnosticSource | undefined): string {
        if (!source) return "Diagnostic";
        if (source === "lint") return "Lint";
        if (source === "markdown_lsp") return "Markdown LSP";
        if (source === "code_lsp") return "Code LSP";
        if (source === "ast") return "AST";
        if (source === "plugin") return "Plugin";
        if (source.startsWith("plugin:")) return source.slice("plugin:".length);
        return "Diagnostic";
      }

      function show_tooltip(
        view: EditorView,
        pos: number,
        message: string,
        label: string,
      ) {
        tooltip_el.innerHTML = "";
        const lsp_header = document.createElement("span");
        lsp_header.style.fontSize = "10px";
        lsp_header.style.textTransform = "uppercase";
        lsp_header.style.letterSpacing = "0.05em";
        lsp_header.style.color = "var(--muted-foreground)";
        lsp_header.style.display = "block";
        lsp_header.style.marginBottom = "4px";
        lsp_header.textContent = label;
        tooltip_el.appendChild(lsp_header);
        const msg_body = document.createElement("div");
        msg_body.className = "lsp-hover-content";
        msg_body.innerHTML = render_lsp_markdown(message);
        tooltip_el.appendChild(msg_body);
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

          const specs = decos_at_pos.map(
            (d) =>
              d.spec as {
                diagnostic_message?: string;
                diagnostic_source?: DiagnosticSource;
              },
          );
          const messages = specs
            .map((s) => s.diagnostic_message)
            .filter(Boolean);

          if (messages.length > 0) {
            const sources = [
              ...new Set(specs.map((s) => source_label(s.diagnostic_source))),
            ];
            const label = sources.join(" / ");
            show_tooltip(
              editor_view,
              pos_result.pos,
              messages.join("\n\n"),
              label,
            );
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
