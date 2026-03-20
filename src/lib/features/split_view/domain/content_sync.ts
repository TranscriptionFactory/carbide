export type SyncDirection =
  | "primary_to_secondary"
  | "secondary_to_primary"
  | "none";

export type SyncResult = {
  direction: SyncDirection;
  markdown: string;
};

export type ContentSyncInput = {
  primary_markdown: string;
  secondary_markdown: string;
  last_synced_primary: string | null;
  last_synced_secondary: string | null;
};

export function normalize_for_comparison(markdown: string): string {
  return markdown.replace(/\r\n/g, "\n").replace(/[ \t]+$/gm, "");
}

export function resolve_content_sync_direction(
  input: ContentSyncInput,
): SyncResult {
  const {
    primary_markdown,
    secondary_markdown,
    last_synced_primary,
    last_synced_secondary,
  } = input;

  const norm_primary = normalize_for_comparison(primary_markdown);
  const norm_secondary = normalize_for_comparison(secondary_markdown);
  const norm_last_primary =
    last_synced_primary !== null
      ? normalize_for_comparison(last_synced_primary)
      : null;
  const norm_last_secondary =
    last_synced_secondary !== null
      ? normalize_for_comparison(last_synced_secondary)
      : null;

  const primary_changed =
    norm_last_primary !== null ? norm_primary !== norm_last_primary : false;
  const secondary_changed =
    norm_last_secondary !== null
      ? norm_secondary !== norm_last_secondary
      : false;

  if (primary_changed && !secondary_changed) {
    return { direction: "primary_to_secondary", markdown: primary_markdown };
  }

  if (secondary_changed && !primary_changed) {
    return { direction: "secondary_to_primary", markdown: secondary_markdown };
  }

  if (norm_last_primary === null && norm_last_secondary === null) {
    if (norm_primary !== norm_secondary) {
      return { direction: "primary_to_secondary", markdown: primary_markdown };
    }
  }

  return { direction: "none", markdown: "" };
}
