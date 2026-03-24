import type { ActionRegistry } from "$lib/app/action_registry/action_registry";
import type { ReferenceService } from "./reference_service";
import type { ReferenceStore } from "../state/reference_store.svelte";

export function register_reference_actions(input: {
  registry: ActionRegistry;
  reference_service: ReferenceService;
  reference_store: ReferenceStore;
}) {
  const { registry, reference_service, reference_store } = input;

  registry.register({
    id: "reference.load_library",
    label: "References: Load Library",
    execute: async () => {
      await reference_service.load_library();
    },
  });

  registry.register({
    id: "reference.search_library",
    label: "References: Search Library",
    execute: async (query: unknown) => {
      if (typeof query !== "string") return;
      reference_service.search_library(query);
    },
  });

  registry.register({
    id: "reference.remove_reference",
    label: "References: Remove Reference",
    execute: async (citekey: unknown) => {
      if (typeof citekey !== "string") return;
      await reference_service.remove_reference(citekey);
    },
  });

  registry.register({
    id: "reference.toggle_citekey",
    label: "References: Toggle Citekey Selection",
    execute: async (citekey: unknown) => {
      if (typeof citekey !== "string") return;
      reference_store.toggle_citekey(citekey);
    },
  });

  registry.register({
    id: "reference.clear_selection",
    label: "References: Clear Selection",
    execute: async () => {
      reference_store.set_selected_citekeys([]);
    },
  });

  registry.register({
    id: "reference.import_bibtex",
    label: "References: Import BibTeX",
    execute: async (bibtex: unknown) => {
      if (typeof bibtex !== "string") return;
      await reference_service.import_bibtex(bibtex);
    },
  });

  registry.register({
    id: "reference.import_ris",
    label: "References: Import RIS",
    execute: async (ris: unknown) => {
      if (typeof ris !== "string") return;
      await reference_service.import_ris(ris);
    },
  });

  registry.register({
    id: "reference.lookup_doi",
    label: "References: Lookup DOI",
    execute: async (doi: unknown) => {
      if (typeof doi !== "string") return;
      await reference_service.lookup_doi(doi);
    },
  });

  registry.register({
    id: "reference.render_bibliography",
    label: "References: Render Bibliography",
    execute: async (args: unknown) => {
      if (!args || typeof args !== "object") return;
      const { citekeys, style } = args as {
        citekeys: string[];
        style: string;
      };
      await reference_service.render_bibliography(citekeys, style);
    },
  });

  registry.register({
    id: "reference.test_zotero_connection",
    label: "References: Test Zotero Connection",
    execute: async () => {
      await reference_service.test_zotero_connection();
    },
  });

  registry.register({
    id: "reference.search_zotero",
    label: "References: Search Zotero",
    execute: async (query: unknown) => {
      if (typeof query !== "string") return;
      await reference_service.search_zotero(query);
    },
  });

  registry.register({
    id: "reference.import_from_zotero",
    label: "References: Import from Zotero",
    execute: async (citekeys: unknown) => {
      if (!Array.isArray(citekeys)) return;
      await reference_service.import_from_zotero(citekeys as string[]);
    },
  });
}
