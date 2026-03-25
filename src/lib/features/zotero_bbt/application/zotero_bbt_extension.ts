import type {
  ReferenceSearchExtension,
  CslItem,
  PdfAnnotation,
} from "$lib/features/reference";
import type { ZoteroPort } from "../ports";

export class ZoteroBbtExtension implements ReferenceSearchExtension {
  readonly id = "zotero_bbt";
  readonly label = "Zotero (BBT)";

  constructor(private port: ZoteroPort) {}

  test_connection(): Promise<boolean> {
    return this.port.test_connection();
  }

  search(query: string, limit?: number): Promise<CslItem[]> {
    return this.port.search_items(query, limit);
  }

  get_item(citekey: string): Promise<CslItem | null> {
    return this.port.get_item(citekey);
  }

  async get_annotations(citekey: string): Promise<PdfAnnotation[]> {
    return this.port.get_item_annotations(citekey);
  }
}
