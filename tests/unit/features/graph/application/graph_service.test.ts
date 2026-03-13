import { describe, it, expect, vi } from "vitest";
import { GraphService } from "$lib/features/graph/application/graph_service";
import type { GraphPort } from "$lib/features/graph/ports";
import { GraphStore } from "$lib/features/graph/state/graph_store.svelte";
import type { VaultStore } from "$lib/features/vault";
import type { EditorStore } from "$lib/features/editor";
import type { VaultId, NoteId, NotePath } from "$lib/shared/types/ids";

describe("GraphService", () => {
  const mock_graph_port = {
    load_note_neighborhood: vi.fn(),
  } as unknown as GraphPort;

  const mock_vault_store = {
    vault: { id: "vault-1" as VaultId },
  } as unknown as VaultStore;

  const mock_editor_store = {
    open_note: {
      meta: {
        id: "note-1" as NoteId,
        path: "test.md" as NotePath,
        title: "Test",
      },
    },
  } as unknown as EditorStore;

  const graph_store = new GraphStore();

  const service = new GraphService(
    mock_graph_port,
    mock_vault_store,
    mock_editor_store,
    graph_store,
  );

  it("loads note neighborhood and updates store", async () => {
    const snapshot = {
      center: { path: "test.md" },
      backlinks: [],
      outlinks: [],
      orphan_links: [],
      stats: {},
    };
    vi.mocked(mock_graph_port.load_note_neighborhood).mockResolvedValue(snapshot as any);

    await service.load_note_neighborhood("test.md");

    expect(mock_graph_port.load_note_neighborhood).toHaveBeenCalledWith("vault-1", "test.md");
    expect(graph_store.snapshot).toEqual(snapshot);
    expect(graph_store.status).toBe("ready");
    expect(graph_store.panel_open).toBe(true);
  });

  it("handles loading error", async () => {
    vi.mocked(mock_graph_port.load_note_neighborhood).mockRejectedValue(new Error("Failed"));

    await service.load_note_neighborhood("test.md");

    expect(graph_store.status).toBe("error");
    expect(graph_store.error).toBe("Failed");
  });

  it("focuses active note", async () => {
    const snapshot = {
      center: { path: "test.md" },
      backlinks: [],
      outlinks: [],
      orphan_links: [],
      stats: {},
    };
    vi.mocked(mock_graph_port.load_note_neighborhood).mockResolvedValue(snapshot as any);

    await service.focus_active_note();

    expect(mock_graph_port.load_note_neighborhood).toHaveBeenCalledWith("vault-1", "test.md");
    expect(graph_store.center_note_path).toBe("test.md");
  });

  it("clears store if no vault is active", async () => {
    const service_no_vault = new GraphService(
      mock_graph_port,
      { vault: null } as unknown as VaultStore,
      mock_editor_store,
      graph_store,
    );

    await service_no_vault.load_note_neighborhood("test.md");

    expect(graph_store.panel_open).toBe(false);
    expect(graph_store.status).toBe("idle");
  });

  it("refreshes current graph", async () => {
    graph_store.start_loading("test.md");
    const snapshot = {
      center: { path: "test.md" },
      backlinks: [],
      outlinks: [],
      orphan_links: [],
      stats: {},
    };
    vi.mocked(mock_graph_port.load_note_neighborhood).mockResolvedValue(snapshot as any);

    await service.refresh_current();

    expect(mock_graph_port.load_note_neighborhood).toHaveBeenCalledWith("vault-1", "test.md");
  });
});
