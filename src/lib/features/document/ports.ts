export interface DocumentPort {
  read_file(vault_id: string, relative_path: string): Promise<string>;
  resolve_asset_url(vault_id: string, relative_path: string): string;
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
