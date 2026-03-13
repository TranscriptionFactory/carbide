<script lang="ts">
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import { Button } from "$lib/components/ui/button";
  import { RefreshCw, Settings, Trash2 } from "@lucide/svelte";

  const { stores, services } = use_app_context();

  let is_discovering = $state(false);

  async function discover_plugins() {
    is_discovering = true;
    try {
      await services.plugin.discover();
    } finally {
      is_discovering = false;
    }
  }

  // Initial discovery
  $effect(() => {
    if (stores.vault.vault) {
      void discover_plugins();
    }
  });

  const plugin_list = $derived(Array.from(stores.plugin.plugins.values()));
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
          <div class="flex flex-col p-3 border rounded-lg bg-card">
            <div class="flex items-start justify-between">
              <div>
                <h3 class="text-sm font-medium">{plugin.manifest.name}</h3>
                <p class="text-xs text-muted-foreground">
                  {plugin.manifest.version} by {plugin.manifest.author}
                </p>
              </div>
              <div class="flex items-center gap-1">
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
