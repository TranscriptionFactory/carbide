export type WindowKind = "main" | "viewer";

export type WindowInit =
  | { kind: "main"; vault_path?: string; file_path?: string }
  | { kind: "viewer"; vault_path: string; file_path: string };

export function parse_window_init(search_params: URLSearchParams): WindowInit {
  const kind = search_params.get("window_kind");
  const vault_path = search_params.get("vault_path");
  const file_path = search_params.get("file_path");

  if (kind === "viewer" && vault_path && file_path) {
    return { kind: "viewer", vault_path, file_path };
  }
  if (kind === "browse" && vault_path) {
    return file_path
      ? { kind: "main", vault_path, file_path }
      : { kind: "main", vault_path };
  }
  if (vault_path) {
    return file_path
      ? { kind: "main", vault_path, file_path }
      : { kind: "main", vault_path };
  }
  return { kind: "main" };
}

export function compute_title(init: WindowInit): string {
  switch (init.kind) {
    case "main": {
      if (init.vault_path) {
        const name = init.vault_path.split("/").at(-1) ?? init.vault_path;
        return `Carbide — ${name}`;
      }
      return "Carbide";
    }
    case "viewer": {
      const name = init.file_path.split("/").at(-1) ?? init.file_path;
      return name;
    }
  }
}
