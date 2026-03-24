import type {
  ReferenceStoragePort,
  CitationPort,
  DoiLookupPort,
  ZoteroPort,
} from "../ports";
import type { ReferenceStore } from "../state/reference_store.svelte";
import type { CslItem, ReferenceSource } from "../types";
import type { VaultStore } from "$lib/features/vault";
import type { OpStore } from "$lib/app/orchestration/op_store.svelte";
import { generate_citekey, match_query } from "../domain/csl_utils";
import { error_message } from "$lib/shared/utils/error_message";

export class ReferenceService {
  constructor(
    private storage_port: ReferenceStoragePort,
    private store: ReferenceStore,
    private vault_store: VaultStore,
    private op_store: OpStore,
    private now_ms: () => number,
    private citation_port: CitationPort | null = null,
    private doi_port: DoiLookupPort | null = null,
    private zotero_port: ZoteroPort | null = null,
  ) {}

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
      const key_set = new Set(citekeys);
      const items = this.store.library_items.filter((i) => key_set.has(i.id));
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

  list_citation_styles(): string[] {
    if (!this.citation_port) return [];
    return this.citation_port.list_styles();
  }

  private require_zotero_port(): ZoteroPort {
    if (!this.zotero_port) throw new Error("Zotero port not available");
    return this.zotero_port;
  }

  async test_zotero_connection(): Promise<boolean> {
    const port = this.require_zotero_port();
    const op_key = "reference.test_zotero_connection";
    this.op_store.start(op_key, this.now_ms());
    try {
      const connected = await port.test_connection();
      this.store.set_connection_status(
        connected ? "connected" : "disconnected",
      );
      this.store.set_error(null);
      this.op_store.succeed(op_key);
      return connected;
    } catch (e) {
      const msg = error_message(e);
      this.store.set_connection_status("disconnected");
      this.store.set_error(msg);
      this.op_store.fail(op_key, msg);
      return false;
    }
  }

  async search_zotero(query: string): Promise<CslItem[]> {
    const port = this.require_zotero_port();
    const op_key = "reference.search_zotero";
    this.op_store.start(op_key, this.now_ms());
    try {
      const items = await port.search_items(query);
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

  async import_from_zotero(citekeys: string[]): Promise<void> {
    const port = this.require_zotero_port();
    await this.import_parsed("reference.import_from_zotero", async () => {
      const results = await Promise.all(
        citekeys.map((key) => port.get_item(key)),
      );
      return results.filter((item): item is CslItem => item !== null);
    });
  }
}
