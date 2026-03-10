import type { UIStore } from "$lib/app";
import type { DocumentService } from "$lib/features/document";
import type { TabStore } from "$lib/features/tab";

export function create_document_cache_reactor(
  tab_store: TabStore,
  ui_store: UIStore,
  document_service: DocumentService,
): () => void {
  let last_active_document_id: string | null = null;

  return $effect.root(() => {
    $effect(() => {
      document_service.set_inactive_content_limit(
        ui_store.editor_settings.document_inactive_cache_limit,
      );
    });

    $effect(() => {
      const tabs = tab_store.tabs;
      const active_tab = tab_store.active_tab;
      const active_document_id =
        active_tab?.kind === "document" ? active_tab.id : null;
      const open_document_ids = tabs
        .filter((tab) => tab.kind === "document")
        .map((tab) => tab.id);

      document_service.sync_open_tabs(active_document_id, open_document_ids);

      if (
        active_document_id &&
        active_document_id !== last_active_document_id
      ) {
        last_active_document_id = active_document_id;
        void document_service.ensure_content(active_document_id);
        return;
      }

      if (!active_document_id) {
        last_active_document_id = null;
      }
    });
  });
}
