import { describe, expect, it, vi } from "vitest";
import { UIStore } from "$lib/app";
import { TerminalStore } from "$lib/features/terminal";
import { VaultStore } from "$lib/features/vault";
import {
  create_terminal_reconcile_reactor,
  resolve_terminal_reconcile_targets,
} from "$lib/reactors/terminal_reconcile.reactor.svelte";

async function flush_effects() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("terminal_reconcile.reactor", () => {
  it("returns no targets when sessions already match the desired fixed config", () => {
    const store = new TerminalStore();
    store.ensure_session({
      id: "terminal:primary",
      shell_path: "/bin/zsh",
      cwd: "/vault-a",
      cwd_policy: "fixed",
      respawn_policy: "manual",
    });

    const targets = resolve_terminal_reconcile_targets({
      session_ids: store.session_ids,
      sessions: store.sessions,
      shell_path: "/bin/zsh",
      vault_path: "/vault-b",
      follow_active_vault: false,
    });

    expect(targets).toEqual([]);
  });

  it("returns a target when the shell path changes", () => {
    const store = new TerminalStore();
    store.ensure_session({
      id: "terminal:primary",
      shell_path: "/bin/zsh",
      cwd: "/vault-a",
      cwd_policy: "fixed",
      respawn_policy: "manual",
    });

    const targets = resolve_terminal_reconcile_targets({
      session_ids: store.session_ids,
      sessions: store.sessions,
      shell_path: "/bin/bash",
      vault_path: "/vault-a",
      follow_active_vault: false,
    });

    expect(targets).toEqual([
      {
        session_id: "terminal:primary",
        shell_path: "/bin/bash",
        cwd: "/vault-a",
        cwd_policy: "fixed",
        respawn_policy: "manual",
      },
    ]);
  });

  it("returns a target when a follow-active-vault session needs a new cwd", () => {
    const store = new TerminalStore();
    store.ensure_session({
      id: "terminal:primary",
      shell_path: "/bin/zsh",
      cwd: "/vault-a",
      cwd_policy: "follow_active_vault",
      respawn_policy: "on_context_change",
    });

    const targets = resolve_terminal_reconcile_targets({
      session_ids: store.session_ids,
      sessions: store.sessions,
      shell_path: "/bin/zsh",
      vault_path: "/vault-b",
      follow_active_vault: true,
    });

    expect(targets).toEqual([
      {
        session_id: "terminal:primary",
        shell_path: "/bin/zsh",
        cwd: "/vault-b",
        cwd_policy: "follow_active_vault",
        respawn_policy: "on_context_change",
      },
    ]);
  });

  it("returns a cleanup function", async () => {
    const terminal_store = new TerminalStore();
    const ui_store = new UIStore();
    const vault_store = new VaultStore();
    const reconcile_session = vi.fn(() => Promise.resolve("terminal:primary"));

    vault_store.set_vault({
      id: "vault-a",
      path: "/vault-a",
    } as never);
    terminal_store.ensure_session({
      id: "terminal:primary",
      shell_path: "/bin/zsh",
      cwd: "/vault-a",
      cwd_policy: "fixed",
      respawn_policy: "manual",
    });
    ui_store.set_editor_settings({
      ...ui_store.editor_settings,
      terminal_shell_path: "/bin/bash",
    });

    const unmount = create_terminal_reconcile_reactor(
      terminal_store,
      ui_store,
      vault_store,
      {
        reconcile_session,
      } as never,
    );

    await flush_effects();
    expect(typeof unmount).toBe("function");
    unmount();
  });
});
