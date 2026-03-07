export type WindowKind = "main" | "browse" | "viewer";

export type WindowInit =
  | { kind: "main" }
  | { kind: "browse"; vault_id: string; folder_path: string }
  | { kind: "viewer"; vault_id: string; file_path: string; file_name: string };

export function compute_title(init: WindowInit): string {
  switch (init.kind) {
    case "main":
      return "otterly";
    case "browse":
      return init.folder_path.split("/").pop() ?? "Browse";
    case "viewer":
      return init.file_name;
  }
}

export function serialize_window_init(init: WindowInit): string {
  return JSON.stringify(init);
}

export function parse_window_init(raw: string | null): WindowInit {
  if (!raw) return { kind: "main" };
  try {
    const parsed = JSON.parse(raw) as WindowInit;
    if (
      parsed.kind === "main" ||
      parsed.kind === "browse" ||
      parsed.kind === "viewer"
    ) {
      return parsed;
    }
    return { kind: "main" };
  } catch {
    return { kind: "main" };
  }
}

export function get_window_init_from_url(): WindowInit {
  const params = new URLSearchParams(window.location.search);
  return parse_window_init(params.get("init"));
}
