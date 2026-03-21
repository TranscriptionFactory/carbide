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
  primary_snapshot: string | null;
  secondary_snapshot: string | null;
};

export function normalize_for_comparison(markdown: string): string {
  return markdown.replace(/\r\n/g, "\n").replace(/[ \t]+$/gm, "");
}

export function resolve_content_sync(input: ContentSyncInput): SyncResult {
  const {
    primary_markdown,
    secondary_markdown,
    primary_snapshot,
    secondary_snapshot,
  } = input;

  const norm_primary = normalize_for_comparison(primary_markdown);
  const norm_secondary = normalize_for_comparison(secondary_markdown);

  if (norm_primary === norm_secondary) {
    return { direction: "none", markdown: "" };
  }

  const primary_changed =
    primary_snapshot === null || norm_primary !== primary_snapshot;
  const secondary_changed =
    secondary_snapshot === null || norm_secondary !== secondary_snapshot;

  if (primary_changed && secondary_changed) {
    return { direction: "none", markdown: "" };
  }

  if (primary_changed) {
    return { direction: "primary_to_secondary", markdown: primary_markdown };
  }

  if (secondary_changed) {
    return { direction: "secondary_to_primary", markdown: secondary_markdown };
  }

  return { direction: "none", markdown: "" };
}
