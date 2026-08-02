export type GitSyncStatus =
  | "idle"
  | "committing"
  | "discarding"
  | "fetching"
  | "pushing"
  | "pulling"
  | "error";

export type GitFileStatus = {
  path: string;
  status: "modified" | "added" | "deleted" | "untracked" | "conflicted";
};

export type GitStatus = {
  branch: string;
  is_dirty: boolean;
  ahead: number;
  behind: number;
  has_remote: boolean;
  has_upstream: boolean;
  remote_url: string | null;
  files: GitFileStatus[];
};

export type GitRemoteResult = {
  success: boolean;
  message: string | null;
  error: string | null;
};

export type GitCommit = {
  hash: string;
  short_hash: string;
  author: string;
  timestamp_ms: number;
  message: string;
};

export const CHECKPOINT_PREFIX = "Checkpoint:";

export type GitDiffLine = {
  type: "context" | "addition" | "deletion";
  content: string;
  old_line: number | null;
  new_line: number | null;
};

// `file_path` mirrors the Rust struct (features/git/service.rs) and the
// generated bindings; the hand-written type had drifted without it, which made
// per-file attribution of a multi-file diff invisible from TypeScript.
export type GitDiffHunk = {
  file_path: string;
  header: string;
  lines: GitDiffLine[];
};

export type GitDiff = {
  additions: number;
  deletions: number;
  hunks: GitDiffHunk[];
};
