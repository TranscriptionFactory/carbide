export type AppTarget = "full" | "lite";
export type WindowKind = "main" | "viewer";

export type WindowInit =
  | {
      kind: "main";
      vault_path?: string;
      file_path?: string;
      app_target?: AppTarget;
    }
  | {
      kind: "viewer";
      vault_path: string;
      file_path: string;
      app_target?: AppTarget;
    };

export function parse_app_target(search_params: URLSearchParams): AppTarget {
  return search_params.get("app_target") === "lite" ? "lite" : "full";
}

export function parse_window_init(search_params: URLSearchParams): WindowInit {
  const kind = search_params.get("window_kind");
  const vault_path = search_params.get("vault_path");
  const file_path = search_params.get("file_path");
  const app_target = parse_app_target(search_params);

  if (kind === "viewer" && vault_path && file_path) {
    return { kind: "viewer", vault_path, file_path, app_target };
  }
  if (kind === "browse" && vault_path) {
    return file_path
      ? { kind: "main", vault_path, file_path, app_target }
      : { kind: "main", vault_path, app_target };
  }
  if (vault_path) {
    return file_path
      ? { kind: "main", vault_path, file_path, app_target }
      : { kind: "main", vault_path, app_target };
  }
  return { kind: "main", app_target };
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
