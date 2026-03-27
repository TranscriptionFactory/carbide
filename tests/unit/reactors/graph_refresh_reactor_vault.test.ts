import { describe, it, expect } from "vitest";
import { resolve_graph_refresh_decision } from "$lib/reactors/graph_refresh.reactor.svelte";

describe("resolve_graph_refresh_decision (vault mode)", () => {
  const initial_state = {
    last_panel_open: false,
    last_vault_id: null,
  };

  it("returns load_vault when panel opens in vault mode", () => {
    const decision = resolve_graph_refresh_decision(initial_state, {
      panel_open: true,
      center_note_path: null,
      vault_id: "vault-1",
      snapshot_note_path: null,
      status: "idle",
      view_mode: "vault",
    });

    expect(decision.action).toBe("load_vault");
  });

  it("returns noop when active note changes in vault mode", () => {
    const state = {
      last_panel_open: true,
      last_vault_id: "vault-1",
    };

    const decision = resolve_graph_refresh_decision(state, {
      panel_open: true,
      center_note_path: "new.md",
      vault_id: "vault-1",
      snapshot_note_path: "old.md",
      status: "ready",
      view_mode: "vault",
    });

    expect(decision.action).toBe("noop");
  });

  it("returns clear when vault changes regardless of mode", () => {
    const state = {
      last_panel_open: true,
      last_vault_id: "vault-1",
    };

    const decision = resolve_graph_refresh_decision(state, {
      panel_open: true,
      center_note_path: null,
      vault_id: "vault-2",
      snapshot_note_path: null,
      status: "ready",
      view_mode: "vault",
    });

    expect(decision.action).toBe("clear");
  });
});
