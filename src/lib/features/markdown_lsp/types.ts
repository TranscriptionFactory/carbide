export type MarkdownLspStatus =
  | "idle"
  | "starting"
  | "running"
  | "error"
  | "stopped";

export type MarkdownLspHoverResult = {
  contents: string | null;
};

export type MarkdownLspRange = {
  start_line: number;
  start_character: number;
  end_line: number;
  end_character: number;
};

export type MarkdownLspLocation = {
  uri: string;
  range: MarkdownLspRange;
};

export type MarkdownLspCodeAction = {
  title: string;
  kind: string | null;
  data: string | null;
  raw_json: string;
};

export type MarkdownLspCompletionItem = {
  label: string;
  detail: string | null;
  insert_text: string | null;
};

export type MarkdownLspStartResult = {
  completion_trigger_characters: string[];
  effective_provider: string;
};

export type MarkdownLspStartReason =
  | "initial_start"
  | "lazy_open_note"
  | "explicit_restart"
  | "explicit_action";

export type MarkdownLspSymbol = {
  name: string;
  kind: number;
  location: MarkdownLspLocation;
};

export type MarkdownLspTextEdit = {
  range: MarkdownLspRange;
  new_text: string;
};

export type MarkdownLspWorkspaceEditResult = {
  files_created: string[];
  files_deleted: string[];
  files_modified: string[];
  errors: string[];
};

export type MarkdownLspPrepareRenameResult = {
  range: MarkdownLspRange;
  placeholder: string;
};

export type MarkdownLspInlayHint = {
  position_line: number;
  position_character: number;
  label: string;
};

export type MarkdownLspDocumentSymbol = {
  name: string;
  kind: number;
  container_name: string | null;
  location: MarkdownLspLocation;
};

export type MarkdownLspLspDiagnostic = {
  line: number;
  character: number;
  end_line: number;
  end_character: number;
  severity: string;
  message: string;
};

export type MarkdownLspDiagnosticsEvent = {
  type: "diagnostics_updated";
  vault_id: string;
  uri: string;
  diagnostics: MarkdownLspLspDiagnostic[];
};

export type MarkdownLspStatusEvent = {
  type: "status_changed";
  vault_id: string;
  status: string;
};

export type MarkdownLspEvent =
  | MarkdownLspDiagnosticsEvent
  | MarkdownLspStatusEvent;

export type IweActionInfo = {
  name: string;
  action_type: string;
  title: string;
};

export type IweConfigStatus = {
  exists: boolean;
  config_url: string;
  config_path: string;
  action_count: number;
  action_names: string[];
  actions: IweActionInfo[];
};
