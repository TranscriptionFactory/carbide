import type {
  DocumentPort,
  PdfExportPort,
  ReadingPositionPort,
  TrustEntry,
  TrustLevel,
  TrustScope,
  TrustedHtmlPort,
} from "$lib/features/document/ports";
import type { DocumentStore } from "$lib/features/document/state/document_store.svelte";
import type { DocumentContentState } from "$lib/features/document/state/document_store.svelte";
import {
  is_editable_type,
  type DocumentFileType,
} from "$lib/features/document/types/document";
import type { VaultStore } from "$lib/features/vault";
import {
  render_note_to_html,
  type ImageResolver,
} from "$lib/features/document/domain/note_html";
import {
  build_clipboard_provenance,
  derive_artifact_filename,
  join_vault_path,
  parse_provenance,
  provenance_sidecar_path,
  serialize_provenance,
  type ArtifactProvenance,
} from "$lib/features/document/domain/html_artifact_paste";

const DEFAULT_INACTIVE_CONTENT_LIMIT = 3;

export type DocumentAiContext = {
  tab_id: string;
  file_path: string;
  file_title: string;
  content: string;
};

function needs_text_content(file_type: DocumentFileType): boolean {
  return file_type === "text" || file_type === "html" || file_type === "csv";
}

function derive_document_title(file_path: string): string {
  const basename = file_path.split("/").pop() ?? file_path;
  const dot_index = basename.lastIndexOf(".");
  const without_ext = dot_index > 0 ? basename.slice(0, dot_index) : basename;
  return without_ext || basename;
}

export class DocumentService {
  constructor(
    private readonly document_port: DocumentPort,
    private readonly vault_store: VaultStore,
    private readonly document_store: DocumentStore,
    private readonly now_ms: () => number = () => Date.now(),
    private readonly inactive_content_limit = DEFAULT_INACTIVE_CONTENT_LIMIT,
    private readonly pdf_export_port?: PdfExportPort,
    private readonly trusted_html_port?: TrustedHtmlPort,
    private readonly reading_position_port?: ReadingPositionPort,
  ) {
    this.document_store.set_inactive_content_limit(inactive_content_limit);
  }

  async refresh_trust_level(file_path: string): Promise<TrustLevel> {
    const vault_id = this.vault_store.vault?.id;
    if (!vault_id || !this.trusted_html_port) {
      this.document_store.set_trust_level(file_path, "safe");
      return "safe";
    }
    const level = await this.trusted_html_port.get_level(vault_id, file_path);
    this.document_store.set_trust_level(file_path, level);
    return level;
  }

  async list_trusted_html(): Promise<TrustEntry[]> {
    const vault_id = this.vault_store.vault?.id;
    if (!vault_id || !this.trusted_html_port) return [];
    return this.trusted_html_port.list(vault_id);
  }

  async grant_trust(
    path: string,
    scope: TrustScope,
    level: TrustLevel,
  ): Promise<void> {
    const vault_id = this.vault_store.vault?.id;
    if (!vault_id || !this.trusted_html_port) return;
    await this.trusted_html_port.grant(vault_id, path, scope, level);
    this.document_store.clear_trust_levels();
  }

  async revoke_trust(path: string, scope: TrustScope): Promise<void> {
    const vault_id = this.vault_store.vault?.id;
    if (!vault_id || !this.trusted_html_port) return;
    await this.trusted_html_port.revoke(vault_id, path, scope);
    this.document_store.clear_trust_levels();
  }

  async request_trust_grant(file_path: string): Promise<boolean> {
    if (!this.trusted_html_port) return false;
    const folder_path = await this.trusted_html_port.parent_folder(file_path);
    return new Promise<boolean>((resolve_promise) => {
      this.document_store.open_trust_request({
        file_path,
        folder_path,
        resolve: (granted) => resolve_promise(granted),
      });
    });
  }

  async resolve_pending_trust(
    scope: TrustScope | null,
    level: TrustLevel,
  ): Promise<void> {
    const req = this.document_store.pending_trust_request;
    if (!req) return;
    if (scope === null) {
      this.document_store.close_trust_request();
      req.resolve(false);
      return;
    }
    const path = scope === "file" ? req.file_path : req.folder_path;
    await this.grant_trust(path, scope, level);
    await this.refresh_trust_level(req.file_path);
    this.document_store.close_trust_request();
    req.resolve(true);
  }

  async save_html_artifact(
    folder_path: string,
    html: string,
    now: Date = new Date(this.now_ms()),
  ): Promise<{ html_path: string; meta_path: string } | null> {
    const vault_id = this.vault_store.vault?.id;
    if (!vault_id) return null;
    const { html_filename, meta_filename } = derive_artifact_filename(
      html,
      now,
    );
    const html_path = join_vault_path(folder_path, html_filename);
    const meta_path = join_vault_path(folder_path, meta_filename);
    const provenance = build_clipboard_provenance(now);
    await this.document_port.write_file(vault_id, html_path, html);
    await this.document_port.write_file(
      vault_id,
      meta_path,
      serialize_provenance(provenance),
    );
    return { html_path, meta_path };
  }

  async read_provenance(file_path: string): Promise<ArtifactProvenance | null> {
    const vault_id = this.vault_store.vault?.id;
    if (!vault_id) return null;
    const sidecar_path = provenance_sidecar_path(file_path);
    try {
      const json = await this.document_port.read_file(vault_id, sidecar_path);
      return parse_provenance(json);
    } catch {
      return null;
    }
  }

  async refresh_provenance(
    file_path: string,
  ): Promise<ArtifactProvenance | null> {
    const provenance = await this.read_provenance(file_path);
    this.document_store.set_provenance(file_path, provenance);
    return provenance;
  }

  async clear_provenance(file_path: string): Promise<void> {
    const vault_id = this.vault_store.vault?.id;
    if (!vault_id) return;
    const sidecar_path = provenance_sidecar_path(file_path);
    try {
      await this.document_port.delete_file(vault_id, sidecar_path);
    } catch {
      // Sidecar may not exist; clearing in-memory state is still useful.
    }
    this.document_store.set_provenance(file_path, null);
  }

  async open_document(
    tab_id: string,
    file_path: string,
    file_type: DocumentFileType,
    initial_pdf_page?: number,
    initial_cfi?: string,
  ): Promise<void> {
    const normalized_initial_pdf_page =
      typeof initial_pdf_page === "number" &&
      Number.isInteger(initial_pdf_page) &&
      initial_pdf_page > 0
        ? initial_pdf_page
        : undefined;
    if (!this.document_store.get_viewer_state(tab_id)) {
      const cfi =
        file_type === "epub"
          ? (initial_cfi ?? (await this.read_saved_position(file_path)))
          : null;
      this.document_store.set_viewer_state(tab_id, {
        tab_id,
        file_path,
        file_type,
        zoom: 1,
        scroll_top: 0,
        pdf_page: normalized_initial_pdf_page ?? 1,
        cfi,
        html_view_mode: "safe",
        load_status: "idle",
        error_message: null,
      });
    } else if (file_type === "pdf" && normalized_initial_pdf_page) {
      this.document_store.update_pdf_page(tab_id, normalized_initial_pdf_page);
    }

    await this.ensure_content(tab_id);
  }

  private async read_saved_position(file_path: string): Promise<string | null> {
    const vault_id = this.vault_store.vault?.id;
    if (!vault_id || !this.reading_position_port) return null;
    try {
      return await this.reading_position_port.get(vault_id, file_path);
    } catch {
      return null;
    }
  }

  async save_reading_position(tab_id: string, cfi: string): Promise<void> {
    const vault_id = this.vault_store.vault?.id;
    if (!vault_id || !this.reading_position_port) return;
    const viewer = this.document_store.get_viewer_state(tab_id);
    if (!viewer || viewer.file_type !== "epub") return;
    this.document_store.update_cfi(tab_id, cfi);
    await this.reading_position_port.set(vault_id, viewer.file_path, cfi);
  }

  async force_load_content(tab_id: string): Promise<void> {
    await this.ensure_content(tab_id, true);
  }

  async ensure_content(tab_id: string, force?: boolean): Promise<void> {
    const viewer_state = this.document_store.get_viewer_state(tab_id);
    if (!viewer_state) return;

    const existing = this.document_store.get_content_state(tab_id);
    if (!force && existing?.status === "ready") {
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
      edited_content: null,
      is_dirty: false,
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
          force,
        );

        const current_viewer = this.document_store.get_viewer_state(tab_id);
        if (current_viewer?.file_path !== viewer_state.file_path) return;

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

  resolve_asset_url(vault_id: string, file_path: string): string {
    return this.document_port.resolve_asset_url(vault_id, file_path);
  }

  get_document_ai_context(tab_id: string): DocumentAiContext | null {
    const viewer = this.document_store.get_viewer_state(tab_id);
    if (!viewer || !is_editable_type(viewer.file_type)) return null;
    const content = this.document_store.get_current_content(tab_id);
    if (content === null) return null;
    return {
      tab_id,
      file_path: viewer.file_path,
      file_title: derive_document_title(viewer.file_path),
      content,
    };
  }

  apply_document_ai_output(tab_id: string, output: string): boolean {
    const viewer = this.document_store.get_viewer_state(tab_id);
    if (!viewer || !is_editable_type(viewer.file_type)) return false;
    this.document_store.set_edited_content(tab_id, output);
    return true;
  }

  async save(tab_id: string): Promise<void> {
    const content_state = this.document_store.get_content_state(tab_id);
    if (!content_state || !content_state.is_dirty) return;

    const vault_id = this.vault_store.vault?.id;
    if (!vault_id) return;

    const content = content_state.edited_content ?? content_state.content;
    if (content === null) return;

    await this.document_port.write_file(
      vault_id,
      content_state.file_path,
      content,
    );
    this.document_store.mark_clean(tab_id, content);
  }

  async export_note_pdf(
    title: string,
    markdown: string,
    image_resolver?: ImageResolver,
  ): Promise<void> {
    if (!this.pdf_export_port) return;
    const path = await this.pdf_export_port.pick_pdf_save_path(title);
    if (path === null) return;
    const html = await render_note_to_html(title, markdown, {
      ...(image_resolver ? { image_resolver } : {}),
    });
    await this.pdf_export_port.export_html_to_pdf(html, path);
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
        (entry) =>
          entry.status === "ready" &&
          entry.tab_id !== active_tab_id &&
          !entry.is_dirty,
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
