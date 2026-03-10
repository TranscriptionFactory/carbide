export interface ShellPort {
  open_url: (url: string) => Promise<void>;
  open_path: (path: string) => Promise<void>;
}
