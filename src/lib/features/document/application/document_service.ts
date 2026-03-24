import type { DocumentPort } from "$lib/features/document/ports";
import type { DocumentStore } from "$lib/features/document/state/document_store.svelte";
import type { DocumentContentState } from "$lib/features/document/state/document_store.svelte";
import type { DocumentFileType } from "$lib/features/document/types/document";
import type { VaultStore } from "$lib/features/vault";

const DEFAULT_INACTIVE_CONTENT_LIMIT = 3;

function needs_text_content(file_type: DocumentFileType): boolean {
  return (
    file_type === "code" ||
    file_type === "csv" ||
    file_type === "text" ||
    file_type === "html"
  );
}

export class DocumentService {
  constructor(
    private readonly document_port: DocumentPort,
    private readonly vault_store: VaultStore,
    private readonly document_store: DocumentStore,
    private readonly now_ms: () => number = () => Date.now(),
    private readonly inactive_content_limit = DEFAULT_INACTIVE_CONTENT_LIMIT,
  ) {
    this.document_store.set_inactive_content_limit(inactive_content_limit);
  }

  async open_document(
    tab_id: string,
    file_path: string,
    file_type: DocumentFileType,
    initial_pdf_page?: number,
  ): Promise<void> {
    const normalized_initial_pdf_page =
      typeof initial_pdf_page === "number" &&
      Number.isInteger(initial_pdf_page) &&
      initial_pdf_page > 0
        ? initial_pdf_page
        : undefined;
    if (!this.document_store.get_viewer_state(tab_id)) {
      this.document_store.set_viewer_state(tab_id, {
        tab_id,
        file_path,
        file_type,
        zoom: 1,
        scroll_top: 0,
        pdf_page: normalized_initial_pdf_page ?? 1,
        load_status: "idle",
        error_message: null,
      });
    } else if (file_type === "pdf" && normalized_initial_pdf_page) {
      this.document_store.update_pdf_page(tab_id, normalized_initial_pdf_page);
    }

    await this.ensure_content(tab_id);
  }

  async ensure_content(tab_id: string): Promise<void> {
    const viewer_state = this.document_store.get_viewer_state(tab_id);
    if (!viewer_state) return;

    const existing = this.document_store.get_content_state(tab_id);
    if (existing?.status === "ready") {
      this.document_store.touch_content_state(tab_id, this.now_ms());
      return;
    }
    if (existing?.status === "loading") {
      return;
    }

    const vault_id = this.vault_store.vault?.id;
    if (!vault_id) return;

    const loading_state: DocumentContentState = {
      tab_id,
      file_path: viewer_state.file_path,
      file_type: viewer_state.file_type,
      status: "loading",
      error_message: null,
      content: null,
      buffer_id: null,
      line_count: null,
      asset_url: null,
      last_accessed_at: this.now_ms(),
      pdf_metadata: null,
    };

    this.document_store.set_content_state(tab_id, loading_state);
    this.document_store.set_load_status(tab_id, "loading");

    try {
      let next_state: DocumentContentState;

      if (needs_text_content(viewer_state.file_type)) {
        const content = await this.document_port.read_file(
          vault_id,
          viewer_state.file_path,
        );
        next_state = {
          ...loading_state,
          status: "ready",
          content,
        };
      } else {
        next_state = {
          ...loading_state,
          status: "ready",
          asset_url: this.document_port.resolve_asset_url(
            vault_id,
            viewer_state.file_path,
          ),
        };
      }

      this.document_store.set_content_state(tab_id, {
        ...next_state,
        last_accessed_at: this.now_ms(),
      });
      this.document_store.set_load_status(tab_id, "ready");
    } catch (error) {
      const error_message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to load document";
      this.document_store.set_content_state(tab_id, {
        ...loading_state,
        status: "error",
        error_message,
      });
      this.document_store.set_load_status(tab_id, "error", error_message);
    }
  }

  close_document(tab_id: string): void {
    const existing = this.document_store.get_content_state(tab_id);
    if (existing?.buffer_id) {
      this.document_port.close_buffer(existing.buffer_id).catch(() => {});
    }
    this.document_store.clear_content_state(tab_id);
    this.document_store.remove_viewer_state(tab_id);
  }

  set_inactive_content_limit(limit: number): void {
    this.document_store.set_inactive_content_limit(limit);
  }

  sync_open_tabs(active_tab_id: string | null, open_tab_ids: string[]): void {
    const open_ids = new Set(open_tab_ids);

    for (const tab_id of [...this.document_store.content_states.keys()]) {
      if (!open_ids.has(tab_id)) {
        const existing = this.document_store.get_content_state(tab_id);
        if (existing?.buffer_id) {
          this.document_port.close_buffer(existing.buffer_id).catch(() => {});
        }
        this.document_store.clear_content_state(tab_id);
      }
    }

    for (const tab_id of [...this.document_store.viewer_states.keys()]) {
      if (!open_ids.has(tab_id)) {
        this.document_store.remove_viewer_state(tab_id);
      }
    }

    this.evict_inactive_content(active_tab_id);
  }

  private evict_inactive_content(active_tab_id: string | null): void {
    const ready_entries = [...this.document_store.content_states.values()]
      .filter(
        (entry) => entry.status === "ready" && entry.tab_id !== active_tab_id,
      )
      .sort((a, b) => b.last_accessed_at - a.last_accessed_at);

    const entries_to_evict = ready_entries.slice(
      this.document_store.inactive_content_limit,
    );

    for (const entry of entries_to_evict) {
      if (entry.buffer_id) {
        this.document_port.close_buffer(entry.buffer_id).catch(() => {});
      }
      this.document_store.clear_content_state(entry.tab_id);
      this.document_store.set_load_status(entry.tab_id, "idle");
    }
  }
}
