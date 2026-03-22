import type {
  IweCodeAction,
  IweCompletionItem,
  IweHoverResult,
  IweInlayHint,
  IweLocation,
  IwePrepareRenameResult,
  IweSymbol,
  IweTextEdit,
  IweWorkspaceEditResult,
} from "$lib/features/iwe/types";

export interface IwePort {
  start(vault_id: string): Promise<void>;
  stop(vault_id: string): Promise<void>;

  did_open(vault_id: string, file_path: string, content: string): Promise<void>;
  did_change(
    vault_id: string,
    file_path: string,
    version: number,
    content: string,
  ): Promise<void>;
  did_save(vault_id: string, file_path: string, content: string): Promise<void>;

  hover(
    vault_id: string,
    file_path: string,
    line: number,
    character: number,
  ): Promise<IweHoverResult>;
  references(
    vault_id: string,
    file_path: string,
    line: number,
    character: number,
  ): Promise<IweLocation[]>;
  definition(
    vault_id: string,
    file_path: string,
    line: number,
    character: number,
  ): Promise<IweLocation[]>;
  code_actions(
    vault_id: string,
    file_path: string,
    start_line: number,
    start_character: number,
    end_line: number,
    end_character: number,
  ): Promise<IweCodeAction[]>;
  code_action_resolve(
    vault_id: string,
    code_action_json: string,
  ): Promise<IweWorkspaceEditResult>;
  workspace_symbols(vault_id: string, query: string): Promise<IweSymbol[]>;
  rename(
    vault_id: string,
    file_path: string,
    line: number,
    character: number,
    new_name: string,
  ): Promise<IweWorkspaceEditResult>;
  prepare_rename(
    vault_id: string,
    file_path: string,
    line: number,
    character: number,
  ): Promise<IwePrepareRenameResult | null>;
  completion(
    vault_id: string,
    file_path: string,
    line: number,
    character: number,
  ): Promise<IweCompletionItem[]>;
  formatting(vault_id: string, file_path: string): Promise<IweTextEdit[]>;
  inlay_hints(vault_id: string, file_path: string): Promise<IweInlayHint[]>;
}
