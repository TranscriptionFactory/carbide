export type DiagnosticSource =
  | "lint"
  | "markdown_lsp"
  | "ast"
  | "code_lsp"
  | "plugin"
  | `plugin:${string}`;

export type DiagnosticSeverity = "error" | "warning" | "info" | "hint";

export type Diagnostic = {
  source: DiagnosticSource;
  line: number;
  column: number;
  end_line: number;
  end_column: number;
  severity: DiagnosticSeverity;
  message: string;
  rule_id: string | null;
  fixable: boolean;
};
