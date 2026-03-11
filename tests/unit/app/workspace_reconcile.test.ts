import { describe, expect, it, vi } from "vitest";
import { ActionRegistry } from "$lib/app/action_registry/action_registry";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import { create_workspace_reconcile } from "$lib/app/orchestration/workspace_reconcile";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((next_resolve) => {
    resolve = next_resolve;
  });
  return { promise, resolve };
}

describe("create_workspace_reconcile", () => {
  it("runs tree refresh before index sync", async () => {
    const registry = new ActionRegistry();
    const calls: string[] = [];

    registry.register({
      id: ACTION_IDS.folder_refresh_tree,
      label: "Refresh Folder Tree",
      execute: () => {
        calls.push("refresh");
      },
    });
    registry.register({
      id: ACTION_IDS.vault_sync_index,
      label: "Sync Vault Index",
      execute: () => {
        calls.push("sync");
      },
    });

    const workspace_reconcile = create_workspace_reconcile(
      registry,
      () => true,
    );

    await workspace_reconcile({
      refresh_tree: true,
      sync_index: true,
    });

    expect(calls).toEqual(["refresh", "sync"]);
  });

  it("coalesces overlapping requests into one follow-up wave", async () => {
    const registry = new ActionRegistry();
    const first_refresh = deferred();
    const execute_folder_refresh_tree = vi.fn(async () => {
      if (execute_folder_refresh_tree.mock.calls.length === 1) {
        await first_refresh.promise;
      }
    });
    const execute_vault_sync_index = vi.fn().mockResolvedValue(undefined);

    registry.register({
      id: ACTION_IDS.folder_refresh_tree,
      label: "Refresh Folder Tree",
      execute: execute_folder_refresh_tree,
    });
    registry.register({
      id: ACTION_IDS.vault_sync_index,
      label: "Sync Vault Index",
      execute: execute_vault_sync_index,
    });

    const workspace_reconcile = create_workspace_reconcile(
      registry,
      () => true,
    );

    const first = workspace_reconcile({
      refresh_tree: true,
      sync_index: true,
    });
    await Promise.resolve();

    const second = workspace_reconcile({
      refresh_tree: true,
      sync_index: true,
    });
    const third = workspace_reconcile({ refresh_tree: true });

    expect(execute_folder_refresh_tree).toHaveBeenCalledTimes(1);
    expect(execute_vault_sync_index).not.toHaveBeenCalled();

    first_refresh.resolve();
    await Promise.all([first, second, third]);

    expect(execute_folder_refresh_tree).toHaveBeenCalledTimes(2);
    expect(execute_vault_sync_index).toHaveBeenCalledTimes(2);
  });

  it("skips index sync when the active vault is not in vault mode", async () => {
    const registry = new ActionRegistry();
    const execute_folder_refresh_tree = vi.fn().mockResolvedValue(undefined);
    const execute_vault_sync_index = vi.fn().mockResolvedValue(undefined);

    registry.register({
      id: ACTION_IDS.folder_refresh_tree,
      label: "Refresh Folder Tree",
      execute: execute_folder_refresh_tree,
    });
    registry.register({
      id: ACTION_IDS.vault_sync_index,
      label: "Sync Vault Index",
      execute: execute_vault_sync_index,
    });

    const workspace_reconcile = create_workspace_reconcile(
      registry,
      () => false,
    );

    await workspace_reconcile({
      refresh_tree: true,
      sync_index: true,
    });

    expect(execute_folder_refresh_tree).toHaveBeenCalledTimes(1);
    expect(execute_vault_sync_index).not.toHaveBeenCalled();
  });
});
