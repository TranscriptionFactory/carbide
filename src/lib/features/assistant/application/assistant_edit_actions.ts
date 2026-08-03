import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import { toast } from "$lib/shared/ui/toast";
import { build_proposal } from "$lib/features/ai";
import { build_document_attachment } from "$lib/features/assistant/domain/document_attachment";
import type { ActionRegistrationInput } from "$lib/app/action_registry/action_registration_input";
import type {
  AssistantDocumentPort,
  AssistantEditTarget,
} from "$lib/features/assistant";
import type { AssistantChatStore } from "$lib/features/assistant/state/assistant_chat_store.svelte";
import type { AssistantProposalStore } from "$lib/features/assistant/state/assistant_proposal_store.svelte";
import type { AssistantKernelService } from "$lib/features/assistant/application/assistant_kernel_service";
import type {
  DocumentEditService,
  EditOpenTabTarget,
} from "$lib/features/assistant/application/document_edit_service";
import type { Proposal } from "$lib/features/assistant/types/proposal";
// An edit is a turn of the same conversation, so it takes the same in-flight
// slot as ask.
import { CHAT_OP_KEY } from "$lib/features/assistant/application/chat_actions";

function changed_hunk_count(proposal: Proposal): number {
  return proposal.hunks.filter((hunk) =>
    hunk.lines.some((line) => line.kind !== "context"),
  ).length;
}

// Pin 5: "edit the open tab". Two targets, one code path — documents (the
// unique AiStore capability being ported) and whole-note instruction edits.
// Selection editing does NOT live here; its successor is the inline menu.
export function register_assistant_edit_actions(
  input: ActionRegistrationInput & {
    chat_store: AssistantChatStore;
    assistant_proposals: AssistantProposalStore;
    assistant_kernel: AssistantKernelService;
    document_edit: DocumentEditService;
    documents: AssistantDocumentPort;
    active_document_path: () => string | null;
  },
) {
  const {
    registry,
    stores,
    chat_store,
    assistant_proposals,
    assistant_kernel,
    document_edit,
    documents,
    active_document_path,
  } = input;

  function resolve_target(): EditOpenTabTarget | null {
    for (const path of [
      chat_store.attached_document?.path,
      active_document_path(),
    ]) {
      if (!path) continue;
      const document = documents.read_document(path);
      if (document) return { kind: "document", ...document };
    }
    const note = stores.editor.open_note;
    if (note) {
      return {
        kind: "note",
        path: String(note.meta.path),
        title: String(note.meta.title || note.meta.name),
        content: note.markdown ?? "",
      };
    }
    return null;
  }

  registry.register({
    id: ACTION_IDS.assistant_attach_document,
    label: "Attach Document to Chat",
    execute: (...args: unknown[]) => {
      const path =
        typeof args[0] === "string" && args[0]
          ? args[0]
          : active_document_path();
      if (!path) {
        toast.info("Open an editable document to attach it");
        return;
      }
      const target: AssistantEditTarget | null = documents.read_document(path);
      if (!target) {
        toast.info("Only open, editable documents can be attached");
        return;
      }
      const result = build_document_attachment(target);
      if (result.status === "too_large") {
        toast.error(
          `Document is too large to attach (${String(result.chars)} characters; limit ${String(result.max)})`,
        );
        return;
      }
      chat_store.attach_document(result.attachment);
    },
  });

  registry.register({
    id: ACTION_IDS.assistant_detach_document,
    label: "Detach Document from Chat",
    execute: () => {
      chat_store.detach_document();
    },
  });

  registry.register({
    id: ACTION_IDS.assistant_edit_open_tab,
    label: "Edit the Open Tab",
    execute: async (...args: unknown[]) => {
      const instructions = typeof args[0] === "string" ? args[0].trim() : "";
      if (!instructions) return;
      if (!stores.ui.editor_settings.ai_enabled) {
        toast.info("AI Assistant is disabled in settings");
        return;
      }
      if (stores.op.is_pending(CHAT_OP_KEY)) return;

      const provider = await assistant_kernel.resolve_provider(
        chat_store.provider_id ||
          stores.ui.editor_settings.ai_default_provider_id,
      );
      if (!provider) {
        toast.error("No AI provider configured");
        return;
      }

      const target = resolve_target();
      if (!target) {
        toast.info("Open a note or an editable document to edit it");
        return;
      }

      const revision = chat_store.begin_turn();
      chat_store.add_user_message(instructions);
      chat_store.start_loading();
      chat_store.set_loading_stage("generating");
      stores.op.start(CHAT_OP_KEY, Date.now());

      let run_id: string | null = null;
      try {
        const result = await document_edit.edit({
          provider_config: provider,
          target,
          instructions,
          on_run_started: (handle) => {
            run_id = handle.id;
          },
        });
        if (revision !== chat_store.revision) return;

        if (result.status === "error") {
          chat_store.fail_streaming(result.message);
          stores.op.fail(CHAT_OP_KEY, result.message);
          return;
        }
        if (result.status === "stopped") {
          chat_store.finish_streaming();
          stores.op.succeed(CHAT_OP_KEY);
          return;
        }
        if (result.status === "empty") {
          chat_store.add_assistant_message(
            "The provider returned nothing to apply, so no changes were proposed.",
            [],
          );
          chat_store.finish_streaming();
          stores.op.succeed(CHAT_OP_KEY);
          return;
        }

        // NEVER auto-accepts (I5 two-acts): the diff lands in the review
        // queue; the transcript only gets a completion message.
        const proposal = build_proposal({
          target:
            target.kind === "document"
              ? { kind: "document", file_path: target.path }
              : { kind: "note", note_path: target.path },
          original_text: target.content,
          draft_text: result.output,
          span: "full_note",
          origin: {
            session_id: chat_store.active_id ?? crypto.randomUUID(),
            run_id,
          },
        });

        const changes = changed_hunk_count(proposal);
        if (changes === 0) {
          chat_store.add_assistant_message(
            `No changes to ${target.title} were proposed.`,
            [],
          );
        } else {
          assistant_proposals.add(proposal);
          chat_store.add_assistant_message(
            `Proposed ${String(changes)} change${changes === 1 ? "" : "s"} to ${target.title}. Open the review centre to apply them.`,
            [],
          );
        }
        chat_store.finish_streaming();
        stores.op.succeed(CHAT_OP_KEY);
      } catch (err) {
        if (revision !== chat_store.revision) return;
        const message = err instanceof Error ? err.message : String(err);
        chat_store.fail_streaming(message);
        stores.op.fail(CHAT_OP_KEY, message);
      }
    },
  });
}
