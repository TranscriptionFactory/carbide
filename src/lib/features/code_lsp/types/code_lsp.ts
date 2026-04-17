export type CodeLspHoverResult = {
  contents: string | null;
};

export type CodeLspRange = {
  start_line: number;
  start_character: number;
  end_line: number;
  end_character: number;
};

export type CodeLspLocation = {
  uri: string;
  range: CodeLspRange;
};

export type CodeLspCompletionItem = {
  label: string;
  detail: string | null;
  insert_text: string | null;
};

export type CodeLspCodeAction = {
  title: string;
  kind: string | null;
  data: unknown | null;
  raw_json: unknown | null;
};

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
