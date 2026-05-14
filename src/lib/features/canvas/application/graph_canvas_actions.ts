import type { ActionRegistrationInput } from "$lib/app/action_registry/action_registration_input";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import type { ActionRegistry } from "$lib/app/action_registry/action_registry";
import type { CanvasService } from "$lib/features/canvas/application/canvas_service";
import type { CanvasData } from "$lib/features/canvas/types/canvas";
import {
  type GraphStore,
  type SearchGraphStore,
  graph_to_canvas,
  type GraphToCanvasInput,
} from "$lib/features/graph";

function generate_canvas_path(slug: string): string {
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const safe_slug = slug
    .trim()
    .replace(/[<>:"/\\|?*]/g, "_")
    .slice(0, 40)
    .trim();
  return `graph-${safe_slug}-${ts}.canvas`;
}

async function write_and_open(
  registry: ActionRegistry,
  canvas_service: CanvasService,
  vault_id: string,
  slug: string,
  data: CanvasData,
): Promise<void> {
  const file_path = generate_canvas_path(slug);
  await canvas_service.write_canvas_data(vault_id, file_path, data);
  await registry.execute(ACTION_IDS.canvas_open, file_path);
}

export function register_graph_canvas_actions(
  input: ActionRegistrationInput & {
    canvas_service: CanvasService;
    graph_store: GraphStore;
    search_graph_store: SearchGraphStore;
  },
) {
  const { registry, stores, canvas_service, graph_store, search_graph_store } =
    input;

  registry.register({
    id: ACTION_IDS.canvas_export_neighborhood_as_canvas,
    label: "Export Neighborhood as Canvas",
    execute: async () => {
      const vault_id = stores.vault.vault?.id;
      const snapshot = graph_store.snapshot;
      if (!vault_id || !snapshot) return;

      const graph_input: GraphToCanvasInput = {
        nodes: [
          { path: snapshot.center.path, title: snapshot.center.title },
          ...snapshot.backlinks.map((n) => ({
            path: n.path,
            title: n.title,
          })),
          ...snapshot.outlinks.map((n) => ({
            path: n.path,
            title: n.title,
          })),
        ],
        edges: [
          ...snapshot.backlinks.map((n) => ({
            source: n.path,
            target: snapshot.center.path,
          })),
          ...snapshot.outlinks.map((n) => ({
            source: snapshot.center.path,
            target: n.path,
          })),
        ],
        layout: "column",
        center_path: snapshot.center.path,
      };

      const data = graph_to_canvas(graph_input);
      await write_and_open(
        registry,
        canvas_service,
        vault_id,
        snapshot.center.title,
        data,
      );
    },
  });

  registry.register({
    id: ACTION_IDS.canvas_export_vault_graph_as_canvas,
    label: "Export Vault Graph as Canvas",
    execute: async (...args: unknown[]) => {
      const vault_id = stores.vault.vault?.id;
      const vault_snapshot = graph_store.vault_snapshot;
      if (!vault_id || !vault_snapshot) return;

      const center_path = (args[0] as string) ?? vault_snapshot.nodes[0]?.path;
      if (!center_path) return;

      const graph_input: GraphToCanvasInput = {
        nodes: vault_snapshot.nodes.map((n) => ({
          path: n.path,
          title: n.title,
          kind: n.kind,
        })),
        edges: vault_snapshot.edges.map((e) => ({
          source: e.source,
          target: e.target,
        })),
        layout: graph_store.focus_mode_active ? "radial" : "column",
        center_path,
      };

      const data = graph_to_canvas(graph_input);
      const slug = center_path.split("/").pop()?.replace(".md", "") ?? "vault";
      await write_and_open(registry, canvas_service, vault_id, slug, data);
    },
  });

  registry.register({
    id: ACTION_IDS.canvas_export_search_graph_as_canvas,
    label: "Export Search Graph as Canvas",
    execute: async (...args: unknown[]) => {
      const vault_id = stores.vault.vault?.id;
      const tab_id = args[0] as string;
      if (!vault_id || typeof tab_id !== "string") return;

      const instance = search_graph_store.get_instance(tab_id);
      const snapshot = instance?.snapshot;
      if (!snapshot) return;

      const graph_input: GraphToCanvasInput = {
        nodes: snapshot.nodes.map((n) => ({
          path: n.path,
          title: n.title,
          kind: n.kind,
        })),
        edges: snapshot.edges.map((e) => ({
          source: e.source,
          target: e.target,
        })),
        layout: "column",
        center_path: snapshot.nodes.find((n) => n.kind === "hit")?.path,
      };

      const data = graph_to_canvas(graph_input);
      await write_and_open(
        registry,
        canvas_service,
        vault_id,
        snapshot.query || "search",
        data,
      );
    },
  });
}
