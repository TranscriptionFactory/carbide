export type SyncDirection =
  | "primary_to_secondary"
  | "secondary_to_primary"
  | "none";

export type SyncResult = {
  direction: SyncDirection;
  markdown: string;
};

export type ActivePaneSyncInput = {
  active_pane: "primary" | "secondary";
  source_markdown: string;
  last_synced_content: string | null;
};

export function normalize_for_comparison(markdown: string): string {
  return markdown.replace(/\r\n/g, "\n").replace(/[ \t]+$/gm, "");
}

export function resolve_active_pane_sync(
  input: ActivePaneSyncInput,
): SyncResult {
  const { active_pane, source_markdown, last_synced_content } = input;

  const norm_source = normalize_for_comparison(source_markdown);

  if (last_synced_content !== null && norm_source === last_synced_content) {
    return { direction: "none", markdown: "" };
  }

  return {
    direction:
      active_pane === "primary"
        ? "primary_to_secondary"
        : "secondary_to_primary",
    markdown: source_markdown,
  };
}
