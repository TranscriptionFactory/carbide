<script lang="ts">
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import { Button } from "$lib/components/ui/button";
  import * as Dialog from "$lib/components/ui/dialog";
  import { ShieldCheck, ShieldX } from "@lucide/svelte";
  import { untrack } from "svelte";
  import { SvelteSet } from "svelte/reactivity";

  interface Props {
    plugin_id: string;
    plugin_name: string;
    permissions: string[];
    on_close: () => void;
  }

  const { plugin_id, plugin_name, permissions, on_close }: Props = $props();

  const { services } = use_app_context();

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

  async function approve_all() {
    await Promise.all(
      permissions.map((p) =>
        services.plugin_settings.approve_permission(plugin_id, p),
      ),
    );
    on_close();
  }

  async function deny_all() {
    await Promise.all(
      permissions.map((p) =>
        services.plugin_settings.deny_permission(plugin_id, p),
      ),
    );
    on_close();
  }

  async function apply() {
    await Promise.all(
      permissions.map((p) =>
        approved.has(p)
          ? services.plugin_settings.approve_permission(plugin_id, p)
          : services.plugin_settings.deny_permission(plugin_id, p),
      ),
    );
    on_close();
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
