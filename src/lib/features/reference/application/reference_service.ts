import type {
  ReferenceStoragePort,
  CitationPort,
  DoiLookupPort,
  ReferenceSearchExtension,
  LinkedSourcePort,
} from "../ports";
import type { ReferenceStore } from "../state/reference_store.svelte";
import type {
  CslItem,
  LinkedSource,
  PdfAnnotation,
  ReferenceSource,
} from "../types";
import type { VaultStore, VaultSettingsPort } from "$lib/features/vault";
import type { VaultId } from "$lib/shared/types/ids";
import type { OpStore } from "$lib/app/orchestration/op_store.svelte";
import { generate_citekey, match_query } from "../domain/csl_utils";
import {
  annotations_to_markdown,
  merge_annotations,
} from "../domain/annotation_to_markdown";
import {
  scan_entry_to_csl_item,
  generate_linked_source_id,
} from "../domain/linked_source_utils";
import { error_message } from "$lib/shared/utils/error_message";

const LINKED_SOURCES_SETTINGS_KEY = "linked_sources";

export class ReferenceService {
  private unsubscribe_events: (() => void) | null = null;

  constructor(
    private storage_port: ReferenceStoragePort,
    private store: ReferenceStore,
    private vault_store: VaultStore,
    private op_store: OpStore,
    private now_ms: () => number,
    private citation_port: CitationPort | null = null,
    private doi_port: DoiLookupPort | null = null,
    private linked_source_port: LinkedSourcePort | null = null,
    private vault_settings_port: VaultSettingsPort | null = null,
  ) {}

  private extensions = new Map<string, ReferenceSearchExtension>();

  register_extension(ext: ReferenceSearchExtension): void {
    this.extensions.set(ext.id, ext);
  }

  unregister_extension(id: string): void {
    this.extensions.delete(id);
  }

  get_registered_extensions(): ReferenceSearchExtension[] {
    return [...this.extensions.values()];
  }

  private require_extension(ext_id: string): ReferenceSearchExtension {
    const ext = this.extensions.get(ext_id);
    if (!ext) throw new Error(`Extension "${ext_id}" not registered`);
    return ext;
  }

  private require_vault_id(): string {
    const vault = this.vault_store.vault;
    if (!vault) throw new Error("No active vault");
    return vault.id;
  }

  async load_library(): Promise<void> {
    const vault_id = this.require_vault_id();
    const op_key = "reference.load_library";
    this.op_store.start(op_key, this.now_ms());
    this.store.set_loading(true);
    try {
      const library = await this.storage_port.load_library(vault_id);
      this.store.set_library_items(library.items);
      this.store.set_error(null);
      this.op_store.succeed(op_key);
    } catch (e) {
      const msg = error_message(e);
      this.store.set_error(msg);
      this.op_store.fail(op_key, msg);
    } finally {
      this.store.set_loading(false);
    }
  }

  async add_reference(item: CslItem, _source: ReferenceSource): Promise<void> {
    const vault_id = this.require_vault_id();
    const op_key = "reference.add";
    this.op_store.start(op_key, this.now_ms());
    try {
      const library = await this.storage_port.add_item(vault_id, item);
      this.store.set_library_items(library.items);
      this.store.set_error(null);
      this.op_store.succeed(op_key);
    } catch (e) {
      const msg = error_message(e);
      this.store.set_error(msg);
      this.op_store.fail(op_key, msg);
    }
  }

  async remove_reference(citekey: string): Promise<void> {
    const vault_id = this.require_vault_id();
    const op_key = "reference.remove";
    this.op_store.start(op_key, this.now_ms());
    try {
      const library = await this.storage_port.remove_item(vault_id, citekey);
      this.store.set_library_items(library.items);
      this.store.set_error(null);
      this.op_store.succeed(op_key);
    } catch (e) {
      const msg = error_message(e);
      this.store.set_error(msg);
      this.op_store.fail(op_key, msg);
    }
  }

  search_library(query: string): CslItem[] {
    if (!query.trim()) {
      this.store.set_search_results([]);
      return [];
    }
    const results = this.store.library_items.filter((item) =>
      match_query(item, query),
    );
    this.store.set_search_results(results);
    return results;
  }

  private require_citation_port(): CitationPort {
    if (!this.citation_port) throw new Error("Citation port not available");
    return this.citation_port;
  }

  private require_doi_port(): DoiLookupPort {
    if (!this.doi_port) throw new Error("DOI lookup port not available");
    return this.doi_port;
  }

  private ensure_citekey(item: CslItem): CslItem {
    if (item.id) return item;
    return { ...item, id: generate_citekey(item) };
  }

  private async import_parsed(
    op_key: string,
    parse: () => Promise<CslItem[]>,
  ): Promise<CslItem[]> {
    this.op_store.start(op_key, this.now_ms());
    try {
      const vault_id = this.require_vault_id();
      const items = await parse();
      const keyed = items.map((i) => this.ensure_citekey(i));
      const current = await this.storage_port.load_library(vault_id);
      const merged = new Map(current.items.map((i: CslItem) => [i.id, i]));
      for (const item of keyed) merged.set(item.id, item);
      const updated = { ...current, items: [...merged.values()] };
      await this.storage_port.save_library(vault_id, updated);
      this.store.set_library_items(updated.items);
      this.store.set_error(null);
      this.op_store.succeed(op_key);
      return keyed;
    } catch (e) {
      const msg = error_message(e);
      this.store.set_error(msg);
      this.op_store.fail(op_key, msg);
      return [];
    }
  }

  async import_bibtex(bibtex: string): Promise<CslItem[]> {
    return this.import_parsed("reference.import_bibtex", () =>
      this.require_citation_port().parse_bibtex(bibtex),
    );
  }

  async import_ris(ris: string): Promise<CslItem[]> {
    return this.import_parsed("reference.import_ris", () =>
      this.require_citation_port().parse_ris(ris),
    );
  }

  async lookup_doi(doi: string): Promise<CslItem | null> {
    const port = this.require_doi_port();
    const op_key = "reference.lookup_doi";
    this.op_store.start(op_key, this.now_ms());
    try {
      const item = await port.lookup_doi(doi);
      if (item) {
        const keyed = this.ensure_citekey(item);
        this.store.set_search_results([keyed]);
        this.op_store.succeed(op_key);
        return keyed;
      }
      this.store.set_search_results([]);
      this.op_store.succeed(op_key);
      return null;
    } catch (e) {
      const msg = error_message(e);
      this.store.set_error(msg);
      this.op_store.fail(op_key, msg);
      return null;
    }
  }

  async render_bibliography(
    citekeys: string[],
    style: string,
  ): Promise<string> {
    const port = this.require_citation_port();
    const op_key = "reference.render_bibliography";
    this.op_store.start(op_key, this.now_ms());
    try {
      const items = this.resolve_items(citekeys);
      if (items.length === 0) {
        this.op_store.succeed(op_key);
        return "";
      }
      const result = await port.render_bibliography(items, style);
      this.op_store.succeed(op_key);
      return result;
    } catch (e) {
      const msg = error_message(e);
      this.store.set_error(msg);
      this.op_store.fail(op_key, msg);
      return "";
    }
  }

  async export_bibliography_html(
    citekeys: string[],
    style: string,
  ): Promise<void> {
    const html = await this.render_bibliography(citekeys, style);
    if (!html) return;
    await save_text_file(
      "Export Bibliography as HTML",
      "bibliography.html",
      html,
      [{ name: "HTML", extensions: ["html", "htm"] }],
    );
  }

  async export_bibtex(citekeys: string[]): Promise<void> {
    const port = this.require_citation_port();
    const op_key = "reference.export_bibtex";
    this.op_store.start(op_key, this.now_ms());
    try {
      const items = this.resolve_items(citekeys);
      if (items.length === 0) {
        this.op_store.succeed(op_key);
        return;
      }
      const bibtex = await port.format_bibtex(items);
      this.op_store.succeed(op_key);
      await save_text_file("Export as BibTeX", "references.bib", bibtex, [
        { name: "BibTeX", extensions: ["bib"] },
      ]);
    } catch (e) {
      const msg = error_message(e);
      this.store.set_error(msg);
      this.op_store.fail(op_key, msg);
    }
  }

  async export_ris(citekeys: string[]): Promise<void> {
    const port = this.require_citation_port();
    const op_key = "reference.export_ris";
    this.op_store.start(op_key, this.now_ms());
    try {
      const items = this.resolve_items(citekeys);
      if (items.length === 0) {
        this.op_store.succeed(op_key);
        return;
      }
      const ris = await port.format_ris(items);
      this.op_store.succeed(op_key);
      await save_text_file("Export as RIS", "references.ris", ris, [
        { name: "RIS", extensions: ["ris"] },
      ]);
    } catch (e) {
      const msg = error_message(e);
      this.store.set_error(msg);
      this.op_store.fail(op_key, msg);
    }
  }

  private resolve_items(citekeys: string[]): CslItem[] {
    const key_set = new Set(citekeys);
    return this.store.library_items.filter((i) => key_set.has(i.id));
  }

  list_citation_styles(): string[] {
    if (!this.citation_port) return [];
    return this.citation_port.list_styles();
  }

  async test_extension_connection(ext_id: string): Promise<boolean> {
    const ext = this.require_extension(ext_id);
    const op_key = `reference.test_extension_connection.${ext_id}`;
    this.op_store.start(op_key, this.now_ms());
    try {
      const connected = await ext.test_connection();
      this.store.set_extension_status(
        ext_id,
        connected ? "connected" : "disconnected",
      );
      this.store.set_error(null);
      this.op_store.succeed(op_key);
      return connected;
    } catch (e) {
      const msg = error_message(e);
      this.store.set_extension_status(ext_id, "disconnected");
      this.store.set_error(msg);
      this.op_store.fail(op_key, msg);
      return false;
    }
  }

  async search_extension(ext_id: string, query: string): Promise<CslItem[]> {
    const ext = this.require_extension(ext_id);
    const op_key = `reference.search_extension.${ext_id}`;
    this.op_store.start(op_key, this.now_ms());
    try {
      const items = await ext.search(query);
      const keyed = items.map((i) => this.ensure_citekey(i));
      this.store.set_search_results(keyed);
      this.store.set_error(null);
      this.op_store.succeed(op_key);
      return keyed;
    } catch (e) {
      const msg = error_message(e);
      this.store.set_error(msg);
      this.op_store.fail(op_key, msg);
      return [];
    }
  }

  async import_from_extension(
    ext_id: string,
    citekeys: string[],
  ): Promise<void> {
    const ext = this.require_extension(ext_id);
    await this.import_parsed(
      `reference.import_from_extension.${ext_id}`,
      async () => {
        const results = await Promise.all(
          citekeys.map((key) => ext.get_item(key)),
        );
        return results.filter((item): item is CslItem => item !== null);
      },
    );
  }

  async ensure_in_library(citekey: string): Promise<CslItem | null> {
    const existing = this.find_in_library(citekey);
    if (existing) return existing;
    for (const ext of this.extensions.values()) {
      try {
        const item = await ext.get_item(citekey);
        if (!item) continue;
        const keyed = this.ensure_citekey(item);
        await this.add_reference(keyed, "extension");
        return keyed;
      } catch {
        continue;
      }
    }
    return null;
  }

  find_in_library(citekey: string): CslItem | null {
    return this.store.library_items.find((i) => i.id === citekey) ?? null;
  }

  async sync_annotations(
    ext_id: string,
    citekey: string,
  ): Promise<PdfAnnotation[]> {
    const ext = this.require_extension(ext_id);
    if (!ext.get_annotations)
      throw new Error(`Extension "${ext_id}" does not support annotations`);
    const vault_id = this.require_vault_id();
    const op_key = `reference.sync_annotations.${ext_id}`;
    this.op_store.start(op_key, this.now_ms());
    try {
      const annotations = await ext.get_annotations(citekey);
      const deduped = merge_annotations([], annotations);
      const markdown = annotations_to_markdown(deduped, citekey);
      await this.storage_port.save_annotation_note(vault_id, citekey, markdown);
      this.store.set_annotations(citekey, deduped);
      this.store.set_error(null);
      this.op_store.succeed(op_key);
      return deduped;
    } catch (e) {
      const msg = error_message(e);
      this.store.set_error(msg);
      this.op_store.fail(op_key, msg);
      return [];
    }
  }

  // ---------------------------------------------------------------------------
  // Linked sources
  // ---------------------------------------------------------------------------

  get_linked_sources_snapshot(): LinkedSource[] {
    return this.store.linked_sources;
  }

  private require_linked_source_port(): LinkedSourcePort {
    if (!this.linked_source_port)
      throw new Error("Linked source port not available");
    return this.linked_source_port;
  }

  private require_vault_settings_port(): VaultSettingsPort {
    if (!this.vault_settings_port)
      throw new Error("Vault settings port not available");
    return this.vault_settings_port;
  }

  async load_linked_sources(): Promise<void> {
    const vault_id = this.require_vault_id() as VaultId;
    const port = this.require_vault_settings_port();
    try {
      const sources = await port.get_vault_setting<LinkedSource[]>(
        vault_id,
        LINKED_SOURCES_SETTINGS_KEY,
      );
      this.store.set_linked_sources(sources ?? []);
    } catch (e) {
      console.error("Failed to load linked sources:", error_message(e));
    }
  }

  private async save_linked_sources(): Promise<void> {
    const vault_id = this.require_vault_id() as VaultId;
    const port = this.require_vault_settings_port();
    await port.set_vault_setting(
      vault_id,
      LINKED_SOURCES_SETTINGS_KEY,
      this.store.linked_sources,
    );
  }

  async add_linked_source(path: string, name: string): Promise<LinkedSource> {
    const source: LinkedSource = {
      id: generate_linked_source_id(),
      path,
      name,
      enabled: true,
      last_scan_at: null,
    };

    this.store.add_linked_source(source);
    await this.save_linked_sources();

    const ls_port = this.require_linked_source_port();
    void this.scan_linked_source(source.id).then(() =>
      ls_port.watch(source.path),
    );

    return source;
  }

  async remove_linked_source(
    id: string,
    remove_references: boolean,
  ): Promise<void> {
    const source = this.store.linked_sources.find((s) => s.id === id);
    if (!source) return;

    const ls_port = this.require_linked_source_port();
    try {
      await ls_port.unwatch(source.path);
    } catch {
      // may already be unwatched
    }

    if (remove_references) {
      const linked_items = this.store.get_linked_source_items(id);
      const vault_id = this.require_vault_id();
      for (const item of linked_items) {
        await this.storage_port.remove_item(vault_id, item.id);
      }
      this.store.set_library_items(
        this.store.library_items.filter(
          (item) => item._linked_source_id !== id,
        ),
      );

      try {
        await ls_port.clear_source(vault_id, id);
      } catch {
        // best-effort FTS cleanup
      }
    }

    this.store.remove_linked_source(id);
    await this.save_linked_sources();
  }

  async toggle_linked_source(id: string): Promise<void> {
    const source = this.store.linked_sources.find((s) => s.id === id);
    if (!source) return;

    const ls_port = this.require_linked_source_port();
    const new_enabled = !source.enabled;

    this.store.update_linked_source(id, { enabled: new_enabled });
    await this.save_linked_sources();

    if (new_enabled) {
      void this.scan_linked_source(id).then(() => ls_port.watch(source.path));
    } else {
      await ls_port.unwatch(source.path);
    }
  }

  async scan_linked_source(
    source_id: string,
  ): Promise<{ added: number; errors: string[] }> {
    const source = this.store.linked_sources.find((s) => s.id === source_id);
    if (!source) return { added: 0, errors: ["Source not found"] };

    const ls_port = this.require_linked_source_port();
    this.store.set_linked_source_sync_status(source_id, "scanning");

    try {
      const entries = await ls_port.scan_folder(source.path);
      const items = entries.map((entry) =>
        scan_entry_to_csl_item(entry, source_id),
      );

      // Bulk merge into library
      const vault_id = this.require_vault_id();
      const current = await this.storage_port.load_library(vault_id);
      const merged = new Map(current.items.map((i: CslItem) => [i.id, i]));

      // Remove stale items from this source
      for (const [key, val] of merged) {
        if (val._linked_source_id === source_id) {
          merged.delete(key);
        }
      }

      for (const item of items) {
        merged.set(item.id, item);
      }

      const updated = { ...current, items: [...merged.values()] };
      await this.storage_port.save_library(vault_id, updated);
      this.store.set_library_items(updated.items);

      // FTS: clear stale, then index all entries
      try {
        await ls_port.clear_source(vault_id, source_id);
        const batch_size = 5;
        for (let i = 0; i < entries.length; i += batch_size) {
          const batch = entries.slice(i, i + batch_size);
          await Promise.all(
            batch.map((entry) =>
              ls_port.index_content(vault_id, source_id, entry),
            ),
          );
        }
      } catch (e) {
        console.error("FTS indexing failed during scan:", error_message(e));
      }

      this.store.update_linked_source(source_id, {
        last_scan_at: this.now_ms(),
      });
      await this.save_linked_sources();
      this.store.set_linked_source_sync_status(source_id, "idle");

      // Async DOI enrichment (non-blocking)
      void this.enrich_dois(
        items.filter((i) => i.DOI),
        source_id,
      );

      return { added: items.length, errors: [] };
    } catch (e) {
      const msg = error_message(e);
      this.store.set_linked_source_sync_status(source_id, "error");
      return { added: 0, errors: [msg] };
    }
  }

  private async enrich_dois(
    items_with_doi: CslItem[],
    _source_id: string,
  ): Promise<void> {
    if (!this.doi_port || items_with_doi.length === 0) return;
    const vault_id = this.require_vault_id();
    const port = this.doi_port;

    // Process in batches of 5
    const batch_size = 5;
    for (let i = 0; i < items_with_doi.length; i += batch_size) {
      const batch = items_with_doi.slice(i, i + batch_size);
      const results = await Promise.allSettled(
        batch.map(async (item) => {
          if (!item.DOI) return null;
          const csl = await port.lookup_doi(item.DOI);
          if (!csl) return null;
          return {
            ...csl,
            id: item.id,
            _linked_source_id: item._linked_source_id,
            _linked_file_path: item._linked_file_path,
            _linked_file_modified_at: item._linked_file_modified_at,
            _source: "linked_source",
          } as CslItem;
        }),
      );

      for (const result of results) {
        if (result.status === "fulfilled" && result.value) {
          this.store.add_item(result.value);
          try {
            await this.storage_port.add_item(vault_id, result.value);
          } catch {
            // best-effort
          }
        }
      }
    }
  }

  async index_linked_pdf(source_id: string, file_path: string): Promise<void> {
    const ls_port = this.require_linked_source_port();
    try {
      const entry = await ls_port.extract_file(file_path);
      const item = scan_entry_to_csl_item(entry, source_id);
      const vault_id = this.require_vault_id();
      await this.storage_port.add_item(vault_id, item);
      this.store.add_item(item);

      try {
        await ls_port.index_content(vault_id, source_id, entry);
      } catch {
        // best-effort FTS
      }

      if (item.DOI) {
        void this.enrich_dois([item], source_id);
      }
    } catch (e) {
      console.error(
        `Failed to index linked file ${file_path}:`,
        error_message(e),
      );
    }
  }

  async unindex_linked_pdf(
    source_id: string,
    file_path: string,
  ): Promise<void> {
    const item = this.store.library_items.find(
      (i) =>
        i._linked_source_id === source_id && i._linked_file_path === file_path,
    );
    if (!item) return;

    const ls_port = this.require_linked_source_port();
    const vault_id = this.require_vault_id();
    try {
      await this.storage_port.remove_item(vault_id, item.id);
      this.store.remove_item(item.id);

      try {
        await ls_port.remove_content(vault_id, source_id, file_path);
      } catch {
        // best-effort FTS cleanup
      }
    } catch (e) {
      console.error(
        `Failed to unindex linked file ${file_path}:`,
        error_message(e),
      );
    }
  }

  async start_linked_source_watchers(): Promise<void> {
    const ls_port = this.linked_source_port;
    if (!ls_port) return;

    // Subscribe to FS events
    this.unsubscribe_events = ls_port.subscribe_events((event) => {
      const source = this.store.linked_sources.find(
        (s) => s.path === event.folder_path && s.enabled,
      );
      if (!source) return;

      switch (event.type) {
        case "added":
        case "modified":
          void this.index_linked_pdf(source.id, event.file_path);
          break;
        case "removed":
          void this.unindex_linked_pdf(source.id, event.file_path);
          break;
      }
    });

    // Start watchers for enabled sources
    for (const source of this.store.linked_sources) {
      if (!source.enabled) continue;
      try {
        await ls_port.watch(source.path);
      } catch (e) {
        console.error(
          `Failed to watch linked source ${source.path}:`,
          error_message(e),
        );
        this.store.set_linked_source_sync_status(source.id, "error");
      }
    }
  }

  async stop_linked_source_watchers(): Promise<void> {
    if (this.unsubscribe_events) {
      this.unsubscribe_events();
      this.unsubscribe_events = null;
    }

    const ls_port = this.linked_source_port;
    if (!ls_port) return;

    try {
      await ls_port.unwatch_all();
    } catch {
      // best effort
    }
  }
}

async function save_text_file(
  title: string,
  default_name: string,
  content: string,
  filters: Array<{ name: string; extensions: string[] }>,
): Promise<void> {
  const { save } = await import("@tauri-apps/plugin-dialog");
  const { invoke } = await import("@tauri-apps/api/core");

  const file_path = await save({ title, defaultPath: default_name, filters });
  if (!file_path) return;

  const bytes = new TextEncoder().encode(content);
  await invoke("write_bytes_to_path", {
    path: file_path,
    data: Array.from(bytes),
  });
}
