export {
  type DocumentFileType,
  detect_file_type,
} from "$lib/features/document/domain/document_types";
export { is_editable_type } from "$lib/features/document/types/document";
export {
  DocumentStore,
  type DocumentContentState,
  type DocumentViewerState,
} from "$lib/features/document/state/document_store.svelte";
export {
  type DocumentPort,
  type PdfExportPort,
  type TrustedHtmlPort,
  type ReadingPositionPort,
  type TrustLevel,
  type TrustScope,
  type TrustEntry,
} from "$lib/features/document/ports";
export { create_document_tauri_adapter } from "$lib/features/document/adapters/document_tauri_adapter";
export { create_pdf_export_tauri_adapter } from "$lib/features/document/adapters/pdf_export_tauri_adapter";
export { create_trusted_html_tauri_adapter } from "$lib/features/document/adapters/trusted_html_tauri_adapter";
export { create_reading_position_tauri_adapter } from "$lib/features/document/adapters/reading_position_tauri_adapter";
export {
  render_note_to_html,
  type ImageResolver,
  type ImageSourceKind,
} from "$lib/features/document/domain/note_html";
export {
  DocumentService,
  type DocumentAiContext,
} from "$lib/features/document/application/document_service";
export { register_document_actions } from "$lib/features/document/application/document_actions";
export { default as DocumentViewer } from "$lib/features/document/ui/document_viewer.svelte";
