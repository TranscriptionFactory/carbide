import { describe, it, expect } from "vitest";
import { resolve_graph_refresh_decision } from "$lib/reactors/graph_refresh.reactor.svelte";

describe("resolve_graph_refresh_decision", () => {
  const initial_state = {
    last_panel_open: false,
    last_index_status: "idle" as const,
    last_vault_id: null,
  };

  it("returns noop when panel is closed", () => {
    const decision = resolve_graph_refresh_decision(initial_state, {
      panel_open: false,
      center_note_path: "note.md",
      vault_id: "vault-1",
      index_status: "idle",
      snapshot_note_path: null,
      status: "idle",
    });

    expect(decision.action).toBe("noop");
  });

  it("returns load when panel opens for the first time", () => {
    const decision = resolve_graph_refresh_decision(initial_state, {
      panel_open: true,
      center_note_path: "note.md",
      vault_id: "vault-1",
      index_status: "idle",
      snapshot_note_path: null,
      status: "idle",
    });

    expect(decision.action).toBe("load");
    expect(decision.note_path).toBe("note.md");
    expect(decision.next_state.last_panel_open).toBe(true);
  });

  it("returns clear when vault changes", () => {
    const state = {
      ...initial_state,
      last_vault_id: "vault-1",
    };

    const decision = resolve_graph_refresh_decision(state, {
      panel_open: true,
      center_note_path: "note.md",
      vault_id: "vault-2",
      index_status: "idle",
      snapshot_note_path: "note.md",
      status: "ready",
    });

    expect(decision.action).toBe("clear");
  });

  it("returns load when index completes", () => {
    const state = {
      ...initial_state,
      last_panel_open: true,
      last_index_status: "running" as const,
      last_vault_id: "vault-1",
    };

    const decision = resolve_graph_refresh_decision(state, {
      panel_open: true,
      center_note_path: "note.md",
      vault_id: "vault-1",
      index_status: "completed",
      snapshot_note_path: "note.md",
      status: "ready",
    });

    expect(decision.action).toBe("load");
    expect(decision.note_path).toBe("note.md");
  });

  it("returns load when center_note_path changes but snapshot is still old", () => {
    const state = {
      ...initial_state,
      last_panel_open: true,
      last_index_status: "completed" as const,
      last_vault_id: "vault-1",
    };

    const decision = resolve_graph_refresh_decision(state, {
      panel_open: true,
      center_note_path: "new.md",
      vault_id: "vault-1",
      index_status: "completed",
      snapshot_note_path: "old.md",
      status: "ready",
    });

    expect(decision.action).toBe("load");
    expect(decision.note_path).toBe("new.md");
  });
});
