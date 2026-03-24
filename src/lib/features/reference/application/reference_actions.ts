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
}
