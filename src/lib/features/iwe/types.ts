export type IweStatus = "idle" | "starting" | "running" | "error" | "stopped";

export type IweHoverResult = {
  contents: string | null;
};

export type IweRange = {
  start_line: number;
  start_character: number;
  end_line: number;
  end_character: number;
};

export type IweLocation = {
  uri: string;
  range: IweRange;
};

export type IweCodeAction = {
  title: string;
  kind: string | null;
  data: string | null;
};

export type IweCompletionItem = {
  label: string;
  detail: string | null;
  insert_text: string | null;
};

export type IweSymbol = {
  name: string;
  kind: number;
  location: IweLocation;
};

export type IweTextEdit = {
  range: IweRange;
  new_text: string;
};

export type IweWorkspaceEditResult = {
  files_created: string[];
  files_deleted: string[];
  files_modified: string[];
  errors: string[];
};

export type IwePrepareRenameResult = {
  range: IweRange;
  placeholder: string;
};

export type IweInlayHint = {
  position_line: number;
  position_character: number;
  label: string;
};

export type IweLspDiagnostic = {
  line: number;
  character: number;
  end_line: number;
  end_character: number;
  severity: string;
  message: string;
};

export type IweDiagnosticsEvent = {
  type: "diagnostics_updated";
  vault_id: string;
  uri: string;
  diagnostics: IweLspDiagnostic[];
};
