export type ToolSelector = { kind: "full" } | { kind: "only"; names: string[] };

export type SurfacePolicy = {
  toolset: ToolSelector;
};

// Surface capability scope, not consent. Chat advertises the whole catalog and
// gates each mutation on the session's auto_approve; narrowing the catalog
// here would be invisible to the user and unable to widen mid-conversation.
export function chat_policy(): SurfacePolicy {
  return {
    toolset: { kind: "full" },
  };
}

export function inline_edit_policy(): SurfacePolicy {
  return {
    toolset: { kind: "only", names: ["read_note", "search_notes"] },
  };
}
