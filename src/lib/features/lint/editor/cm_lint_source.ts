import type { EditorView } from "@codemirror/view";
import type { Text } from "@codemirror/state";
import {
  setDiagnostics,
  lintGutter,
  lintKeymap,
  type Diagnostic as CmDiagnostic,
} from "@codemirror/lint";
import { keymap } from "@codemirror/view";
import type { Diagnostic, DiagnosticSeverity } from "$lib/features/diagnostics";

const SEVERITY_MAP: Record<DiagnosticSeverity, CmDiagnostic["severity"]> = {
  error: "error",
  warning: "warning",
  info: "info",
  hint: "info",
};

export function map_lint_diagnostics(
  doc: Text,
  diagnostics: Diagnostic[],
  on_fix_all?: () => void,
): CmDiagnostic[] {
  const result: CmDiagnostic[] = [];

  for (const d of diagnostics) {
    const from = line_col_to_pos(doc, d.line, d.column);
    const to = line_col_to_pos(doc, d.end_line, d.end_column);
    if (from === -1 || to === -1) continue;

    const clamped_from = Math.min(from, doc.length);
    const clamped_to = Math.min(Math.max(to, clamped_from), doc.length);

    const cm_diag: CmDiagnostic = {
      from: clamped_from,
      to: clamped_to,
      severity: SEVERITY_MAP[d.severity],
      message: d.message,
      ...(d.rule_id ? { source: d.rule_id } : {}),
    };

    if (d.fixable && on_fix_all) {
      cm_diag.actions = [
        {
          name: "Fix All",
          apply: () => on_fix_all(),
        },
      ];
    }

    result.push(cm_diag);
  }

  return result;
}

export function update_cm_diagnostics(
  view: EditorView,
  diagnostics: Diagnostic[],
  on_fix_all?: () => void,
): void {
  const cm_diags = map_lint_diagnostics(
    view.state.doc,
    diagnostics,
    on_fix_all,
  );
  view.dispatch(setDiagnostics(view.state, cm_diags));
}

export function create_lint_extensions() {
  return [lintGutter(), keymap.of(lintKeymap)];
}

function line_col_to_pos(doc: Text, line: number, column: number): number {
  if (line < 1 || line > doc.lines) return -1;
  const line_obj = doc.line(line);
  return line_obj.from + Math.max(0, column - 1);
}
