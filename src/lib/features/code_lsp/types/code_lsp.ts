export type CodeDiagnostic = {
  line: number;
  column: number;
  end_line: number;
  end_column: number;
  severity: CodeDiagnosticSeverity;
  message: string;
  source: string | null;
  code: string | null;
};

export type CodeDiagnosticSeverity = "error" | "warning" | "info" | "hint";

export type CodeLspStatus =
  | "running"
  | "stopped"
  | "starting"
  | { unavailable: { language: string } }
  | { error: { message: string } };

export type CodeLspEvent =
  | {
      type: "diagnostics_updated";
      vault_id: string;
      language: string;
      path: string;
      diagnostics: CodeDiagnostic[];
    }
  | {
      type: "server_status_changed";
      vault_id: string;
      language: string;
      status: CodeLspStatus;
    };
