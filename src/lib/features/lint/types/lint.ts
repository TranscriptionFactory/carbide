export type LintDiagnostic = {
  line: number;
  column: number;
  end_line: number;
  end_column: number;
  severity: LintSeverity;
  message: string;
  rule_id: string | null;
  fixable: boolean;
};

export type LintSeverity = "error" | "warning" | "info" | "hint";

export type FileDiagnostics = {
  path: string;
  diagnostics: LintDiagnostic[];
};

export type LintTextEdit = {
  start_line: number;
  start_column: number;
  end_line: number;
  end_column: number;
  new_text: string;
};

export type LintStatus =
  | "running"
  | "stopped"
  | "starting"
  | { error: { message: string } };

export type LintEvent =
  | {
      type: "diagnostics_updated";
      vault_id: string;
      path: string;
      diagnostics: LintDiagnostic[];
    }
  | {
      type: "status_changed";
      vault_id: string;
      status: LintStatus;
    };
