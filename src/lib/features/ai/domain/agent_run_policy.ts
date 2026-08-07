export type ToolSelector =
  | { kind: "read_only" }
  | { kind: "full" }
  | { kind: "only"; names: string[] };

export type SurfacePolicy = {
  toolset: ToolSelector;
};

export function chat_policy(permission_mode: "safe" | "power"): SurfacePolicy {
  return {
    toolset:
      permission_mode === "power" ? { kind: "full" } : { kind: "read_only" },
  };
}

export function inline_edit_policy(): SurfacePolicy {
  return {
    toolset: { kind: "only", names: ["read_note", "search_notes"] },
  };
}
