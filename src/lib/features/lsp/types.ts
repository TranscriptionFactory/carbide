export type LspCodeAction = {
  title: string;
  kind: string | null;
  data: string | null;
  raw_json: string;
  source: string;
};

export type LspDiagnostic = {
  line: number;
  column: number;
  end_line: number;
  end_column: number;
  severity: string;
  message: string;
  source: string;
  rule_id: string | null;
};
