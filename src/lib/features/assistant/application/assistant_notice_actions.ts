import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import { build_proposal } from "$lib/features/ai";
import { build_notice_draft_text } from "$lib/features/assistant/domain/ambient_notice_edit";
import { AMBIENT_PROPOSAL_ORIGIN } from "$lib/features/assistant/types/ambient";
import type { ActionRegistrationInput } from "$lib/app/action_registry/action_registration_input";
import type { AssistantNoticeStore } from "$lib/features/assistant/state/assistant_notice_store.svelte";
import type { AssistantProposalStore } from "$lib/features/assistant/state/assistant_proposal_store.svelte";
import type { NoteId } from "$lib/shared/types/ids";

// I6, second half: accepting a notice is the FIRST of two explicit user acts.
// It enqueues a Proposal and stops. Nothing here writes a note — the review
// centre's own accept does that, against a base revision computed here.
export function register_assistant_notice_actions(
  input: ActionRegistrationInput & {
    assistant_notices: AssistantNoticeStore;
    assistant_proposals: AssistantProposalStore;
  },
) {
  const { registry, assistant_notices, assistant_proposals, stores, services } =
    input;

  // Prefers the open buffer over disk: the buffer is what the user is looking
  // at, and a proposal computed against staler bytes would be born drifted.
  async function read_note_markdown(note_path: string): Promise<string | null> {
    const open_note = stores.editor.open_note;
    if (open_note && String(open_note.meta.path) === note_path) {
      return open_note.markdown ?? "";
    }

    const vault_id = stores.vault.active_vault_id;
    if (!vault_id) return null;

    try {
      const doc = await services.note.read_note(vault_id, note_path as NoteId);
      return String(doc.markdown);
    } catch {
      return null;
    }
  }

  registry.register({
    id: ACTION_IDS.assistant_accept_notice,
    label: "Accept Ambient Notice",
    execute: async (...args: unknown[]) => {
      const notice_id = typeof args[0] === "string" ? args[0] : "";
      if (!notice_id) return;

      const notice = assistant_notices.get(notice_id);
      if (!notice) return;

      const markdown = await read_note_markdown(notice.note_path);
      if (markdown === null) return;

      const draft_text = build_notice_draft_text(notice, markdown);
      // No derivable edit — an anchor whose text has already been edited away,
      // or a kind that offers no repair. Retire the notice rather than leaving
      // a card whose offer can no longer do anything.
      if (draft_text === null) {
        assistant_notices.dismiss(notice_id);
        return;
      }

      assistant_proposals.add(
        build_proposal({
          note_path: notice.note_path,
          original_text: markdown,
          draft_text,
          target: "full_note",
          origin: AMBIENT_PROPOSAL_ORIGIN,
        }),
      );
      assistant_notices.dismiss(notice_id);
    },
  });

  registry.register({
    id: ACTION_IDS.assistant_dismiss_notice,
    label: "Dismiss Ambient Notice",
    execute: (...args: unknown[]) => {
      const notice_id = typeof args[0] === "string" ? args[0] : "";
      if (!notice_id) return;
      assistant_notices.dismiss(notice_id);
    },
  });
}
