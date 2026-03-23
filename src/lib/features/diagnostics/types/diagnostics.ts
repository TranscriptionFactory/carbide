export type DiagnosticSource = "lint" | "iwe" | "ast" | "plugin";

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
