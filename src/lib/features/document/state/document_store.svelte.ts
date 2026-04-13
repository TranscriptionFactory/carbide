import type {
  DocumentFileType,
  HtmlViewMode,
  PdfMetadata,
} from "$lib/features/document/types/document";

export type DocumentViewerState = {
  tab_id: string;
  file_path: string;
  file_type: DocumentFileType;
  zoom: number;
  scroll_top: number;
  pdf_page: number;
  html_view_mode: HtmlViewMode;
  load_status: "idle" | "loading" | "ready" | "error";
  error_message: string | null;
};

export type DocumentContentState = {
  tab_id: string;
  file_path: string;
  file_type: DocumentFileType;
  status: "loading" | "ready" | "error";
  error_message: string | null;
  content: string | null;
  edited_content: string | null;
  is_dirty: boolean;
  buffer_id: string | null;
  line_count: number | null;
  asset_url: string | null;
  last_accessed_at: number;
  pdf_metadata: PdfMetadata | null;
};

export class DocumentStore {
  viewer_states = $state<Map<string, DocumentViewerState>>(new Map());
  content_states = $state<Map<string, DocumentContentState>>(new Map());
  inactive_content_limit = $state(3);

  set_viewer_state(tab_id: string, state: DocumentViewerState): void {
    this.viewer_states = new Map(this.viewer_states).set(tab_id, state);
  }

  get_viewer_state(tab_id: string): DocumentViewerState | undefined {
    return this.viewer_states.get(tab_id);
  }

  remove_viewer_state(tab_id: string): void {
    const next = new Map(this.viewer_states);
    next.delete(tab_id);
    this.viewer_states = next;
  }

  set_load_status(
    tab_id: string,
    load_status: DocumentViewerState["load_status"],
    error_message: string | null = null,
  ): void {
    this.#patch(tab_id, { load_status, error_message });
  }

  update_zoom(tab_id: string, zoom: number): void {
    this.#patch(tab_id, { zoom });
  }

  update_scroll(tab_id: string, scroll_top: number): void {
    this.#patch(tab_id, { scroll_top });
  }

  update_pdf_page(tab_id: string, page: number): void {
    this.#patch(tab_id, { pdf_page: page });
  }

  toggle_html_view_mode(tab_id: string): void {
    const state = this.viewer_states.get(tab_id);
    if (!state || state.file_type !== "html") return;
    this.#patch(tab_id, {
      html_view_mode: state.html_view_mode === "visual" ? "source" : "visual",
    });
  }

  set_content_state(tab_id: string, state: DocumentContentState): void {
    this.content_states = new Map(this.content_states).set(tab_id, state);
    this.#evict_inactive_content(tab_id);
  }

  get_content_state(tab_id: string): DocumentContentState | undefined {
    return this.content_states.get(tab_id);
  }

  set_pdf_metadata(tab_id: string, metadata: PdfMetadata): void {
    const state = this.content_states.get(tab_id);
    if (!state) return;
    this.content_states = new Map(this.content_states).set(tab_id, {
      ...state,
      pdf_metadata: metadata,
    });
  }

  get_current_content(tab_id: string): string | null {
    const state = this.content_states.get(tab_id);
    if (!state) return null;
    return state.edited_content ?? state.content;
  }

  set_edited_content(tab_id: string, edited_content: string): void {
    const state = this.content_states.get(tab_id);
    if (!state) return;
    this.content_states = new Map(this.content_states).set(tab_id, {
      ...state,
      edited_content,
      is_dirty: true,
    });
  }

  mark_clean(tab_id: string, saved_content: string): void {
    const state = this.content_states.get(tab_id);
    if (!state) return;
    this.content_states = new Map(this.content_states).set(tab_id, {
      ...state,
      content: saved_content,
      edited_content: null,
      is_dirty: false,
    });
  }

  touch_content_state(tab_id: string, now_ms: number): void {
    const state = this.content_states.get(tab_id);
    if (!state) return;
    this.content_states = new Map(this.content_states).set(tab_id, {
      ...state,
      last_accessed_at: now_ms,
    });
  }

  clear_content_state(tab_id: string): void {
    const next = new Map(this.content_states);
    next.delete(tab_id);
    this.content_states = next;
  }

  #evict_inactive_content(protected_tab_id?: string): void {
    const limit = this.inactive_content_limit;
    const evictable = Array.from(this.content_states.entries())
      .filter(([id, state]) => id !== protected_tab_id && !state.is_dirty)
      .sort(([, a], [, b]) => b.last_accessed_at - a.last_accessed_at);

    if (evictable.length <= limit) return;

    const to_remove = evictable.slice(limit);
    const next = new Map(this.content_states);
    for (const [tab_id] of to_remove) {
      next.delete(tab_id);
    }
    this.content_states = next;
  }

  set_inactive_content_limit(limit: number): void {
    this.inactive_content_limit = limit;
  }

  #patch(tab_id: string, fields: Partial<DocumentViewerState>): void {
    const state = this.viewer_states.get(tab_id);
    if (!state) return;
    this.viewer_states = new Map(this.viewer_states).set(tab_id, {
      ...state,
      ...fields,
    });
  }
}
