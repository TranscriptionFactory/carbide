<script lang="ts">
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import { Button } from "$lib/components/ui/button";
  import * as Dialog from "$lib/components/ui/dialog";
  import { ShieldCheck, ShieldX } from "@lucide/svelte";
  import { untrack } from "svelte";
  import { SvelteSet } from "svelte/reactivity";
  import { create_logger } from "$lib/shared/utils/logger";

  interface Props {
    plugin_id: string;
    plugin_name: string;
    permissions: string[];
    on_close: () => void;
  }

  const { plugin_id, plugin_name, permissions, on_close }: Props = $props();

  const { services } = use_app_context();
  const log = create_logger("plugin_permission_dialog");

  const PERMISSION_LABELS: Record<string, string> = {
    "fs:read": "Read vault files",
    "fs:write": "Write vault files",
    "editor:read": "Read editor content",
    "editor:modify": "Modify editor content",
    "commands:register": "Register commands",
    "ui:statusbar": "Add status bar items",
    "ui:panel": "Add sidebar panels",
    "ui:ribbon": "Add ribbon icons",
    "events:subscribe": "Subscribe to vault events",
    "export:save": "Save files to disk",
  };

  function permission_label(permission: string): string {
    return PERMISSION_LABELS[permission] ?? permission;
  }

  let approved = new SvelteSet<string>(untrack(() => permissions));

  function toggle(permission: string) {
    if (approved.has(permission)) {
      approved.delete(permission);
    } else {
      approved.add(permission);
    }
  }

  async function with_retry<T>(
    fn: () => Promise<T>,
    retries = 1,
    delay_ms = 200,
  ): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (retries <= 0) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      const is_transient =
        msg.includes("no such file") ||
        msg.includes("No such file") ||
        msg.includes("ENOENT") ||
        msg.includes("could not be found");
      if (!is_transient) throw err;
      log.warn(
        `Transient file error during permission grant, retrying: ${msg}`,
      );
      await new Promise((r) => setTimeout(r, delay_ms));
      return fn();
    }
  }

  async function apply_permissions(
    grants: Array<{ permission: string; approve: boolean }>,
  ) {
    try {
      await with_retry(() =>
        Promise.all(
          grants.map((g) =>
            g.approve
              ? services.plugin_settings.approve_permission(
                  plugin_id,
                  g.permission,
                )
              : services.plugin_settings.deny_permission(
                  plugin_id,
                  g.permission,
                ),
          ),
        ),
      );
    } catch (err) {
      log.from_error("Failed to apply plugin permissions", err);
    }
    on_close();
  }

  function approve_all() {
    return apply_permissions(
      permissions.map((p) => ({ permission: p, approve: true })),
    );
  }

  function deny_all() {
    return apply_permissions(
      permissions.map((p) => ({ permission: p, approve: false })),
    );
  }

  function apply() {
    return apply_permissions(
      permissions.map((p) => ({ permission: p, approve: approved.has(p) })),
    );
  }

  let open = $state(true);

  function handle_open_change(value: boolean) {
    open = value;
    if (!value) on_close();
  }
</script>

<Dialog.Root {open} onOpenChange={handle_open_change}>
  <Dialog.Content class="max-w-md">
    <Dialog.Header>
      <Dialog.Title class="text-base">Permission Request</Dialog.Title>
      <Dialog.Description class="text-sm text-muted-foreground">
        <span class="font-medium text-foreground">{plugin_name}</span> is requesting
        the following permissions:
      </Dialog.Description>
    </Dialog.Header>

    <div class="space-y-2 py-2">
      {#each permissions as permission (permission)}
        <button
          class="flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm transition-colors hover:bg-accent"
          onclick={() => toggle(permission)}
        >
          <span class="text-foreground">{permission_label(permission)}</span>
          {#if approved.has(permission)}
            <ShieldCheck class="size-4 text-green-600" />
          {:else}
            <ShieldX class="size-4 text-destructive" />
          {/if}
        </button>
      {/each}
    </div>

    <Dialog.Footer class="flex-col gap-2 sm:flex-row">
      <Button variant="outline" size="sm" class="flex-1" onclick={deny_all}
        >Deny All</Button
      >
      <Button variant="outline" size="sm" class="flex-1" onclick={approve_all}
        >Approve All</Button
      >
      <Button size="sm" class="flex-1" onclick={apply}>Apply</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
