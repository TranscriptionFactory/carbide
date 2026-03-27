export type MarksmanStatus =
  | "idle"
  | "starting"
  | "running"
  | "error"
  | "stopped";

export type MarksmanHoverResult = {
  contents: string | null;
};

export type MarksmanRange = {
  start_line: number;
  start_character: number;
  end_line: number;
  end_character: number;
};

export type MarksmanLocation = {
  uri: string;
  range: MarksmanRange;
};

export type MarksmanCodeAction = {
  title: string;
  kind: string | null;
  data: string | null;
  raw_json: string;
};

export type MarksmanCompletionItem = {
  label: string;
  detail: string | null;
  insert_text: string | null;
};

export type MarksmanStartResult = {
  completion_trigger_characters: string[];
};

export type MarksmanSymbol = {
  name: string;
  kind: number;
  location: MarksmanLocation;
};

export type MarksmanTextEdit = {
  range: MarksmanRange;
  new_text: string;
};

export type MarksmanWorkspaceEditResult = {
  files_created: string[];
  files_deleted: string[];
  files_modified: string[];
  errors: string[];
};

export type MarksmanPrepareRenameResult = {
  range: MarksmanRange;
  placeholder: string;
};

export type MarksmanInlayHint = {
  position_line: number;
  position_character: number;
  label: string;
};

export type MarksmanDocumentSymbol = {
  name: string;
  kind: number;
  container_name: string | null;
  location: MarksmanLocation;
};

export type MarksmanLspDiagnostic = {
  line: number;
  character: number;
  end_line: number;
  end_character: number;
  severity: string;
  message: string;
};

export type MarksmanDiagnosticsEvent = {
  type: "diagnostics_updated";
  vault_id: string;
  uri: string;
  diagnostics: MarksmanLspDiagnostic[];
};

export type IweConfigStatus = {
  exists: boolean;
  config_url: string;
  action_count: number;
  action_names: string[];
};
