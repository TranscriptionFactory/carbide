import type { AssistantSession } from "$lib/features/assistant";

export type OmnibarAskStatus = "idle" | "running" | "error";

// The Ask surface reads its answer straight off the live session (I4) rather
// than holding a copy: streaming text is a session mutation, not local state.
export type OmnibarAskView = {
  draft: string;
  session: AssistantSession | null;
  status: OmnibarAskStatus;
  error: string | null;
  can_insert: boolean;
  provider_label: string;
  on_draft_change: (draft: string) => void;
  on_submit: () => void;
  on_insert: () => void;
  on_promote: () => void;
  // esc stops a live run and leaves the surface up; it only dismisses once
  // nothing is streaming, which is what the footer has always advertised.
  on_stop: () => void;
  on_dismiss: () => void;
};
