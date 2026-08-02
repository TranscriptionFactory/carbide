// Derived from the session id rather than random: reopening a session focuses
// the existing tab, and a restored tab keeps the id its persisted
// `active_tab_path` refers to.
export function assistant_session_tab_id(session_id: string): string {
  return `__assistant_session__${session_id}__`;
}

// Only surfaces when the session is gone — a live tab renders the session's own
// title, which tracks renames (I4).
export const ASSISTANT_SESSION_TAB_TITLE = "Assistant";
