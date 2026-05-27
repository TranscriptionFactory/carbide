import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import type { PdfExportPort } from "$lib/features/document/ports";

export function create_pdf_export_tauri_adapter(): PdfExportPort {
  return {
    pick_pdf_save_path(default_name: string): Promise<string | null> {
      return save({
        title: "Export as PDF",
        defaultPath: `${default_name}.pdf`,
        filters: [{ name: "PDF", extensions: ["pdf"] }],
      });
    },
    async export_html_to_pdf(html: string, save_path: string): Promise<void> {
      await invoke("export_html_to_pdf", { html, savePath: save_path });
    },
  };
}
