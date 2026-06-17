import {
  HTML_VIEW_MODES,
  type ArtifactProvenance,
  type DocumentFileType,
  type HtmlViewMode,
  type PdfMetadata,
} from "$lib/features/document/types/document";
import type { TrustLevel } from "$lib/features/document/ports";

export type DocumentViewerState = {
  tab_id: string;
  file_path: string;
  file_type: DocumentFileType;
  zoom: number;
  scroll_top: number;
  pdf_page: number;
  cfi: string | null;
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

export type TrustGrantRequest = {
  file_path: string;
  folder_path: string;
  resolve: (granted: boolean) => void;
};

export class DocumentStore {
  viewer_states = $state<Map<string, DocumentViewerState>>(new Map());
  content_states = $state<Map<string, DocumentContentState>>(new Map());
  trust_levels = $state<Map<string, TrustLevel>>(new Map());
  provenance = $state<Map<string, ArtifactProvenance | null>>(new Map());
  pending_trust_request = $state<TrustGrantRequest | null>(null);
  inactive_content_limit = $state(3);

  get_provenance(file_path: string): ArtifactProvenance | null {
    return this.provenance.get(file_path) ?? null;
  }

  set_provenance(
    file_path: string,
    provenance: ArtifactProvenance | null,
  ): void {
    const next = new Map(this.provenance);
    if (provenance === null) {
      next.delete(file_path);
    } else {
      next.set(file_path, provenance);
    }
    this.provenance = next;
  }

  get_trust_level(file_path: string): TrustLevel {
    return this.trust_levels.get(file_path) ?? "safe";
  }

  set_trust_level(file_path: string, level: TrustLevel): void {
    this.trust_levels = new Map(this.trust_levels).set(file_path, level);
  }

  clear_trust_levels(): void {
    this.trust_levels = new Map();
  }

  open_trust_request(request: TrustGrantRequest): void {
    this.pending_trust_request = request;
  }

  close_trust_request(): void {
    this.pending_trust_request = null;
  }

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

  update_cfi(tab_id: string, cfi: string | null): void {
    this.#patch(tab_id, { cfi });
  }

  set_html_view_mode(tab_id: string, mode: HtmlViewMode): void {
    const state = this.viewer_states.get(tab_id);
    if (!state || state.file_type !== "html") return;
    this.#patch(tab_id, { html_view_mode: mode });
  }

  cycle_html_view_mode(tab_id: string): void {
    const state = this.viewer_states.get(tab_id);
    if (!state || state.file_type !== "html") return;
    const idx = HTML_VIEW_MODES.indexOf(state.html_view_mode);
    const next = HTML_VIEW_MODES[
      (idx + 1) % HTML_VIEW_MODES.length
    ] as HtmlViewMode;
    this.#patch(tab_id, { html_view_mode: next });
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
