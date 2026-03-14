import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import type { ActionRegistrationInput } from "$lib/app/action_registry/action_registration_input";
import type { DocumentService } from "$lib/features/document/application/document_service";
import { detect_file_type } from "$lib/features/document/domain/document_types";
import { export_note_as_pdf } from "$lib/features/document/domain/pdf_export";

type DocumentOpenPayload = {
  file_path: string;
  initial_pdf_page?: number;
};

function normalize_initial_pdf_page(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    return undefined;
  }
  return value;
}

function parse_document_open_payload(
  payload: unknown,
): DocumentOpenPayload | null {
  if (typeof payload === "string" && payload) {
    return { file_path: payload };
  }
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const record = payload as Record<string, unknown>;
  if (typeof record.file_path !== "string" || !record.file_path) {
    return null;
  }
  const parsed: DocumentOpenPayload = {
    file_path: record.file_path,
  };
  const initial_pdf_page = normalize_initial_pdf_page(record.initial_pdf_page);
  if (initial_pdf_page !== undefined) {
    parsed.initial_pdf_page = initial_pdf_page;
  }
  return parsed;
}

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
      const parsed = parse_document_open_payload(args[0]);
      if (!parsed) return;
      const { file_path, initial_pdf_page } = parsed;
      const vault_id = stores.vault.vault?.id;
      if (!vault_id) return;

      const last_slash = file_path.lastIndexOf("/");
      const filename =
        last_slash >= 0 ? file_path.slice(last_slash + 1) : file_path;
      const file_type = detect_file_type(filename);
      if (!file_type) return;

      if (file_type === "canvas" || file_type === "excalidraw") {
        await registry.execute(ACTION_IDS.canvas_open, file_path);
        return;
      }

      const tab = stores.tab.open_document_tab(file_path, filename, file_type);
      await document_service.open_document(
        tab.id,
        file_path,
        file_type,
        initial_pdf_page,
      );
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
