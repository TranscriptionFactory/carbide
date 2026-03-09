import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import type { ActionRegistrationInput } from "$lib/app/action_registry/action_registration_input";
import type { DocumentService } from "$lib/features/document/application/document_service";
import { detect_file_type } from "$lib/features/document/domain/document_types";
import { export_note_as_pdf } from "$lib/features/document/domain/pdf_export";

export function register_document_actions(
  input: ActionRegistrationInput & {
    document_service: DocumentService;
  },
) {
  const { registry, stores, document_service } = input;

  registry.register({
    id: ACTION_IDS.document_open,
    label: "Open Document",
    execute: async (...args: unknown[]) => {
      const file_path = args[0] as string;
      const vault_id = stores.vault.vault?.id;
      if (!vault_id) return;

      const last_slash = file_path.lastIndexOf("/");
      const filename =
        last_slash >= 0 ? file_path.slice(last_slash + 1) : file_path;
      const file_type = detect_file_type(filename);
      if (!file_type) return;

      const tab = stores.tab.open_document_tab(file_path, filename, file_type);
      await document_service.open_document(tab.id, file_path, file_type);
    },
  });

  registry.register({
    id: ACTION_IDS.document_close,
    label: "Close Document",
    execute: (...args: unknown[]) => {
      const tab_id = args[0] as string;
      document_service.close_document(tab_id);
    },
  });

  registry.register({
    id: ACTION_IDS.document_export_pdf,
    label: "Export as PDF",
    execute: async () => {
      const open_note = stores.editor.open_note;
      if (!open_note) return;
      const title = open_note.meta.title || open_note.meta.name;
      await export_note_as_pdf(title, open_note.markdown);
    },
  });
}
