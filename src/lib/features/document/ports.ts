export interface DocumentPort {
  read_file(
    vault_id: string,
    relative_path: string,
    force?: boolean,
  ): Promise<string>;
  write_file(
    vault_id: string,
    relative_path: string,
    content: string,
  ): Promise<void>;
  delete_file(vault_id: string, relative_path: string): Promise<void>;
  resolve_asset_url(vault_id: string, file_path: string): string;
  open_buffer(
    id: string,
    vault_id: string,
    relative_path: string,
  ): Promise<number>;
  read_buffer_window(
    id: string,
    start_line: number,
    end_line: number,
  ): Promise<string>;
  close_buffer(id: string): Promise<void>;
}

export interface PdfExportPort {
  pick_pdf_save_path(default_name: string): Promise<string | null>;
  export_html_to_pdf(html: string, save_path: string): Promise<void>;
}

export type TrustLevel = "safe" | "live" | "live+net";
export type TrustScope = "file" | "folder";

export type TrustEntry = {
  path: string;
  scope: TrustScope;
  level: TrustLevel;
};

export interface TrustedHtmlPort {
  get_level(vault_id: string, file_path: string): Promise<TrustLevel>;
  list(vault_id: string): Promise<TrustEntry[]>;
  grant(
    vault_id: string,
    path: string,
    scope: TrustScope,
    level: TrustLevel,
  ): Promise<void>;
  revoke(vault_id: string, path: string, scope: TrustScope): Promise<void>;
  parent_folder(file_path: string): Promise<string>;
}
