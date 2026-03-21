<script lang="ts">
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import { Button } from "$lib/components/ui/button";
  import {
    RefreshCw,
    Settings,
    ShieldAlert,
    Play,
    Square,
    RotateCw,
  } from "@lucide/svelte";
  import PluginPermissionDialog from "./plugin_permission_dialog.svelte";

  const { stores, services } = use_app_context();

  let is_discovering = $state(false);
  let reloading_ids = $state(new Set<string>());

  interface PermissionDialogState {
    plugin_id: string;
    plugin_name: string;
    permissions: string[];
  }

  let permission_dialog = $state<PermissionDialogState | null>(null);

  async function discover_plugins() {
    is_discovering = true;
    try {
      await services.plugin.discover();
    } finally {
      is_discovering = false;
    }
  }

  $effect(() => {
    if (stores.vault.vault) {
      void discover_plugins();
    }
  });

  const plugin_list = $derived(Array.from(stores.plugin.plugins.values()));

  function pending_permissions(plugin_id: string): string[] {
    return stores.plugin_settings.get_pending_permissions(plugin_id);
  }

  function open_permissions(plugin_id: string, plugin_name: string) {
    const permissions = pending_permissions(plugin_id);
    if (permissions.length === 0) return;
    permission_dialog = { plugin_id, plugin_name, permissions };
  }

  function close_permission_dialog() {
    permission_dialog = null;
  }

  async function reload_plugin(id: string) {
    reloading_ids = new Set([...reloading_ids, id]);
    try {
      await services.plugin.reload_plugin(id);
    } finally {
      reloading_ids = new Set([...reloading_ids].filter((x) => x !== id));
    }
  }
</script>

<div class="PluginManager">
  <div class="PluginManager__header">
    <div class="flex items-center justify-between px-4 py-2 border-b">
      <h2 class="text-sm font-semibold">Plugins</h2>
      <Button
        variant="ghost"
        size="icon"
        onclick={discover_plugins}
        disabled={is_discovering}
      >
        <RefreshCw class="w-4 h-4 {is_discovering ? 'animate-spin' : ''}" />
      </Button>
    </div>
  </div>

  <div class="PluginManager__content p-4 space-y-4">
    {#if plugin_list.length === 0}
      <div class="text-center py-8 text-muted-foreground">
        <p class="text-sm">No plugins discovered.</p>
        <p class="text-xs">
          Place plugins in <code>.carbide/plugins/</code> and click refresh.
        </p>
      </div>
    {:else}
      <div class="space-y-3">
        {#each plugin_list as plugin (plugin.manifest.id)}
          {@const pending = pending_permissions(plugin.manifest.id)}
          {@const is_active = plugin.enabled && plugin.status === "active"}
          {@const is_reloading = reloading_ids.has(plugin.manifest.id)}
          <div class="flex flex-col p-3 border rounded-lg bg-card">
            <div class="flex items-start justify-between">
              <div>
                <h3 class="text-sm font-medium">{plugin.manifest.name}</h3>
                <p class="text-xs text-muted-foreground">
                  {plugin.manifest.version} by {plugin.manifest.author}
                </p>
              </div>
              <div class="flex items-center gap-1">
                {#if pending.length > 0}
                  <Button
                    variant="ghost"
                    size="icon"
                    class="w-8 h-8 relative"
                    onclick={() =>
                      open_permissions(
                        plugin.manifest.id,
                        plugin.manifest.name,
                      )}
                    title="Review pending permissions"
                  >
                    <ShieldAlert class="w-4 h-4 text-amber-500" />
                    <span
                      class="absolute -top-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-500 text-[9px] font-bold text-white"
                    >
                      {pending.length}
                    </span>
                  </Button>
                {/if}
                {#if is_active}
                  <Button
                    variant="ghost"
                    size="icon"
                    class="w-8 h-8"
                    onclick={() => reload_plugin(plugin.manifest.id)}
                    disabled={is_reloading}
                    title="Reload plugin"
                  >
                    <RotateCw
                      class="w-4 h-4 {is_reloading ? 'animate-spin' : ''}"
                    />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    class="w-8 h-8"
                    onclick={() =>
                      services.plugin.unload_then_idle(plugin.manifest.id)}
                    title="Unload plugin"
                  >
                    <Square class="w-3.5 h-3.5" />
                  </Button>
                {:else if plugin.enabled && plugin.status !== "loading"}
                  <Button
                    variant="ghost"
                    size="icon"
                    class="w-8 h-8"
                    onclick={() =>
                      services.plugin.load_and_activate(plugin.manifest.id)}
                    title="Load plugin"
                  >
                    <Play class="w-4 h-4" />
                  </Button>
                {/if}
                <Button variant="ghost" size="icon" class="w-8 h-8">
                  <Settings class="w-4 h-4" />
                </Button>
                <Button
                  variant={plugin.enabled ? "default" : "outline"}
                  size="sm"
                  class="h-7 text-xs px-2"
                  onclick={() =>
                    plugin.enabled
                      ? services.plugin.disable_plugin(plugin.manifest.id)
                      : services.plugin.enable_plugin(plugin.manifest.id)}
                  disabled={plugin.status === "loading"}
                >
                  {plugin.enabled ? "Enabled" : "Disabled"}
                </Button>
              </div>
            </div>
            <p class="mt-2 text-xs text-muted-foreground line-clamp-2">
              {plugin.manifest.description}
            </p>
            {#if plugin.status === "error"}
              <p class="mt-2 text-xs text-destructive">{plugin.error}</p>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

{#if permission_dialog}
  <PluginPermissionDialog
    plugin_id={permission_dialog.plugin_id}
    plugin_name={permission_dialog.plugin_name}
    permissions={permission_dialog.permissions}
    on_close={close_permission_dialog}
  />
{/if}

<style>
  .PluginManager {
    display: flex;
    flex-direction: column;
    height: 100%;
    background-color: var(--background);
  }

  .PluginManager__content {
    overflow-y: auto;
    flex: 1;
  }
</style>
