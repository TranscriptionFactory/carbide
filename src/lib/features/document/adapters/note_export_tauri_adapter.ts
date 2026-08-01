import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import type {
  NoteExportFormat,
  NoteExportPort,
} from "$lib/features/document/ports";
import type { EpubInput } from "$lib/shared/types/epub";

const FORMAT_LABELS: Record<NoteExportFormat, string> = {
  pdf: "PDF",
  html: "HTML",
  epub: "EPUB",
};

export function create_note_export_tauri_adapter(): NoteExportPort {
  return {
    pick_save_path(
      default_name: string,
      format: NoteExportFormat,
    ): Promise<string | null> {
      const label = FORMAT_LABELS[format];
      return save({
        title: `Export as ${label}`,
        defaultPath: `${default_name}.${format}`,
        filters: [{ name: label, extensions: [format] }],
      });
    },
    async export_html_to_pdf(html: string, save_path: string): Promise<void> {
      await invoke("export_html_to_pdf", { html, savePath: save_path });
    },
    async write_html(html: string, save_path: string): Promise<void> {
      await invoke("export_write_html", { html, savePath: save_path });
    },
    async write_epub(
      vault_id: string,
      input: EpubInput,
      save_path: string,
    ): Promise<void> {
      await invoke("export_write_epub", {
        vaultId: vault_id,
        savePath: save_path,
        input,
      });
    },
  };
}
