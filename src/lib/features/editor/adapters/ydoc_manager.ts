import * as Y from "yjs";
import type { Node as PmNode } from "prosemirror-model";
import {
  prosemirrorToYXmlFragment,
  yXmlFragmentToProsemirror,
} from "y-prosemirror";
import { schema } from "./markdown_pipeline";

export type YDocEntry = {
  ydoc: Y.Doc;
  xml_fragment: Y.XmlFragment;
};

const FRAGMENT_NAME = "prosemirror";

export function create_ydoc_manager() {
  const cache = new Map<string, YDocEntry>();

  function get_or_create(note_path: string, pm_doc: PmNode): YDocEntry {
    const existing = cache.get(note_path);
    if (existing) return existing;

    const ydoc = new Y.Doc();
    const xml_fragment = ydoc.getXmlFragment(FRAGMENT_NAME);
    prosemirrorToYXmlFragment(pm_doc, xml_fragment);

    const entry: YDocEntry = { ydoc, xml_fragment };
    cache.set(note_path, entry);
    return entry;
  }

  function hydrate_fresh(note_path: string, pm_doc: PmNode): YDocEntry {
    evict(note_path);
    return get_or_create(note_path, pm_doc);
  }

  function evict(note_path: string) {
    const existing = cache.get(note_path);
    if (existing) {
      existing.ydoc.destroy();
      cache.delete(note_path);
    }
  }

  function rename(old_path: string, new_path: string) {
    const entry = cache.get(old_path);
    if (!entry) return;
    cache.delete(old_path);
    cache.set(new_path, entry);
  }

  function get_pm_doc(note_path: string): PmNode | null {
    const entry = cache.get(note_path);
    if (!entry) return null;
    return yXmlFragmentToProsemirror(schema, entry.xml_fragment);
  }

  function clear() {
    for (const entry of cache.values()) {
      entry.ydoc.destroy();
    }
    cache.clear();
  }

  return {
    get_or_create,
    hydrate_fresh,
    evict,
    rename,
    get_pm_doc,
    clear,
    get: (note_path: string) => cache.get(note_path) ?? null,
  };
}

export type YDocManager = ReturnType<typeof create_ydoc_manager>;
