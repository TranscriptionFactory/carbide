import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import type { ActionRegistry } from "$lib/app/action_registry/action_registry";

export type WorkspaceReconcileRequest = {
  refresh_tree?: boolean;
  sync_index?: boolean;
  sync_index_paths?: { changed: string[]; removed: string[] } | undefined;
};

export type WorkspaceReconcile = (
  request: WorkspaceReconcileRequest,
) => Promise<void>;

type NormalizedWorkspaceReconcileRequest = {
  refresh_tree: boolean;
  sync_index: boolean;
  sync_index_paths: { changed: string[]; removed: string[] } | null;
};

function empty_request(): NormalizedWorkspaceReconcileRequest {
  return {
    refresh_tree: false,
    sync_index: false,
    sync_index_paths: null,
  };
}

function normalize_request(
  request: WorkspaceReconcileRequest,
): NormalizedWorkspaceReconcileRequest {
  return {
    refresh_tree: request.refresh_tree ?? false,
    sync_index: request.sync_index ?? false,
    sync_index_paths: request.sync_index_paths ?? null,
  };
}

function has_request(request: NormalizedWorkspaceReconcileRequest) {
  return (
    request.refresh_tree ||
    request.sync_index ||
    request.sync_index_paths !== null
  );
}

function merge_sync_paths(
  existing: { changed: string[]; removed: string[] } | null,
  incoming: { changed: string[]; removed: string[] } | null,
): { changed: string[]; removed: string[] } | null {
  if (!existing) return incoming;
  if (!incoming) return existing;
  return {
    changed: [...new Set([...existing.changed, ...incoming.changed])],
    removed: [...new Set([...existing.removed, ...incoming.removed])],
  };
}

function merge_requests(
  pending: NormalizedWorkspaceReconcileRequest,
  next: WorkspaceReconcileRequest,
): NormalizedWorkspaceReconcileRequest {
  const normalized_next = normalize_request(next);
  return {
    refresh_tree: pending.refresh_tree || normalized_next.refresh_tree,
    sync_index: pending.sync_index || normalized_next.sync_index,
    sync_index_paths: merge_sync_paths(
      pending.sync_index_paths,
      normalized_next.sync_index_paths,
    ),
  };
}

async function execute_request(
  action_registry: ActionRegistry,
  request: NormalizedWorkspaceReconcileRequest,
  is_vault_mode: boolean,
) {
  if (request.refresh_tree) {
    await action_registry.execute(ACTION_IDS.folder_refresh_tree);
  }
  if (is_vault_mode) {
    if (request.sync_index) {
      await action_registry.execute(ACTION_IDS.vault_sync_index);
    } else if (request.sync_index_paths) {
      await action_registry.execute(ACTION_IDS.vault_sync_index_paths, {
        changed_paths: request.sync_index_paths.changed,
        removed_paths: request.sync_index_paths.removed,
      });
    }
  }
}

export function create_workspace_reconcile(
  action_registry: ActionRegistry,
  is_vault_mode: () => boolean,
): WorkspaceReconcile {
  let pending_request = empty_request();
  let active_run: Promise<void> | null = null;

  return async (request) => {
    pending_request = merge_requests(pending_request, request);

    if (active_run !== null) {
      await active_run;
      return;
    }

    active_run = (async () => {
      try {
        while (has_request(pending_request)) {
          const next_request = pending_request;
          pending_request = empty_request();
          await execute_request(action_registry, next_request, is_vault_mode());
        }
      } finally {
        active_run = null;
      }
    })();

    await active_run;
  };
}

export async function reconcile_workspace(
  action_registry: ActionRegistry,
  request: WorkspaceReconcileRequest,
  options: {
    workspace_reconcile?: WorkspaceReconcile | undefined;
    is_vault_mode: boolean;
  },
) {
  if (options.workspace_reconcile) {
    await options.workspace_reconcile(request);
    return;
  }

  await execute_request(
    action_registry,
    normalize_request(request),
    options.is_vault_mode,
  );
}
