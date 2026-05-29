import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import type { ActionRegistrationInput } from "$lib/app/action_registry/action_registration_input";
import type { DocumentService } from "$lib/features/document/application/document_service";
import type { DocumentStore } from "$lib/features/document/state/document_store.svelte";
import { detect_file_type } from "$lib/features/document/domain/document_types";
import type { ImageResolver } from "$lib/features/document/domain/note_html";
import {
  carbide_asset_url,
  carbide_file_asset_url,
  resolve_relative_asset_path,
} from "$lib/features/note";

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

async function fetch_as_data_uri(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onerror = () => {
        resolve(null);
      };
      reader.onload = () => {
        resolve(typeof reader.result === "string" ? reader.result : null);
      };
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function build_pdf_image_resolver(
  vault_id: string,
  note_path: string,
): ImageResolver {
  return async (src, kind) => {
    if (/^data:/i.test(src)) return src;
    if (/^https?:\/\//i.test(src)) return fetch_as_data_uri(src);
    if (src.startsWith("/")) {
      return fetch_as_data_uri(carbide_file_asset_url(src));
    }
    const decoded = decodeURIComponent(src);
    const asset_path =
      kind === "wiki"
        ? decoded
        : resolve_relative_asset_path(note_path, decoded);
    if (!asset_path) return null;
    return fetch_as_data_uri(carbide_asset_url(vault_id, asset_path));
  };
}

export function register_document_actions(
  input: ActionRegistrationInput & {
    document_service: DocumentService;
    document_store: DocumentStore;
  },
) {
  const { registry, stores, document_service, document_store } = input;

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
    id: ACTION_IDS.document_save,
    label: "Save Document",
    execute: async () => {
      const active_tab = stores.tab.active_tab;
      if (!active_tab || active_tab.kind !== "document") return;
      await document_service.save(active_tab.id);
      stores.tab.set_dirty(active_tab.id, false);
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
    id: ACTION_IDS.document_toggle_source,
    label: "Cycle HTML View Mode (Source / Safe / Live)",
    execute: () => {
      const active_tab = stores.tab.active_tab;
      if (!active_tab || active_tab.kind !== "document") return;
      const viewer = document_store.get_viewer_state(active_tab.id);
      if (!viewer || viewer.file_type !== "html") return;
      document_store.cycle_html_view_mode(active_tab.id);
    },
  });

  registry.register({
    id: ACTION_IDS.document_export_pdf,
    label: "Export as PDF",
    execute: async () => {
      const active_tab = stores.tab.active_tab;
      if (!active_tab || active_tab.kind !== "note") return;
      const open_note = stores.editor.open_note;
      if (!open_note) return;
      const title = open_note.meta.title || open_note.meta.name;
      const vault_id = stores.vault.vault?.id;
      const image_resolver = vault_id
        ? build_pdf_image_resolver(vault_id, open_note.meta.path)
        : undefined;
      await document_service.export_note_pdf(
        title,
        open_note.markdown,
        image_resolver,
      );
    },
  });
}
