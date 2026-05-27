<script lang="ts">
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
  import { Button } from "$lib/components/ui/button";
  import {
    Download,
    Loader2,
    Check,
    Pencil,
    ArrowUpCircle,
  } from "@lucide/svelte";
  import { onMount } from "svelte";

  const { stores, action_registry } = use_app_context();

  let editing_url = $state(false);
  let url_input = $state("");

  const listings = $derived(stores.plugin_marketplace.listings);
  const is_loading = $derived(stores.op.is_pending("plugin.marketplace_fetch"));
  const installed_versions = $derived(
    new Map(
      Array.from(stores.plugin.plugins.entries()).map(([id, p]) => [
        id,
        p.manifest.version,
      ]),
    ),
  );
  const installed_ids = $derived(new Set(installed_versions.keys()));

  function has_update(listing_id: string, listing_version: string): boolean {
    const installed = installed_versions.get(listing_id);
    if (!installed) return false;
    return listing_version > installed;
  }

  function is_installing(id: string): boolean {
    return stores.op.is_pending(`plugin.marketplace_install:${id}`);
  }

  async function fetch_listings() {
    await action_registry.execute(ACTION_IDS.plugin_marketplace_fetch);
  }

  async function install_plugin(id: string) {
    await action_registry.execute(ACTION_IDS.plugin_marketplace_install, id);
  }

  async function update_plugin(id: string) {
    await action_registry.execute(ACTION_IDS.plugin_marketplace_update, id);
  }

  function start_edit_url() {
    url_input = stores.plugin_marketplace.url ?? "";
    editing_url = true;
  }

  async function save_url() {
    if (url_input.trim()) {
      await action_registry.execute(
        ACTION_IDS.plugin_marketplace_save_url,
        url_input.trim(),
      );
    }
    editing_url = false;
    await fetch_listings();
  }

  onMount(() => {
    if (listings.length === 0) {
      void fetch_listings();
    }
  });
</script>

<div class="p-4 space-y-4">
  <div class="flex items-center justify-between">
    <h3 class="text-sm font-semibold">Marketplace</h3>
    <Button
      variant="ghost"
      size="sm"
      class="h-7 text-xs"
      onclick={fetch_listings}
      disabled={is_loading}
    >
      {#if is_loading}
        <Loader2 class="w-3 h-3 animate-spin mr-1" />
      {/if}
      Refresh
    </Button>
  </div>

  <div class="flex items-center gap-2 text-xs text-muted-foreground">
    {#if editing_url}
      <input
        type="text"
        class="flex-1 px-2 py-1 border rounded text-xs bg-background"
        bind:value={url_input}
        onkeydown={(e) => e.key === "Enter" && save_url()}
        placeholder="https://github.com/owner/repo"
      />
      <Button variant="ghost" size="icon" class="w-6 h-6" onclick={save_url}>
        <Check class="w-3 h-3" />
      </Button>
    {:else}
      <span class="truncate flex-1">
        {stores.plugin_marketplace.url ?? "Default marketplace"}
      </span>
      <Button
        variant="ghost"
        size="icon"
        class="w-6 h-6"
        onclick={start_edit_url}
      >
        <Pencil class="w-3 h-3" />
      </Button>
    {/if}
  </div>

  {#if is_loading && listings.length === 0}
    <div class="text-center py-8 text-muted-foreground">
      <Loader2 class="w-5 h-5 animate-spin mx-auto mb-2" />
      <p class="text-sm">Loading marketplace...</p>
    </div>
  {:else if listings.length === 0}
    <div class="text-center py-8 text-muted-foreground">
      <p class="text-sm">No plugins available.</p>
    </div>
  {:else}
    <div class="space-y-3">
      {#each listings as listing (listing.id)}
        {@const installed = installed_ids.has(listing.id)}
        {@const updatable = has_update(listing.id, listing.version)}
        {@const installing = is_installing(listing.id)}
        <div class="flex flex-col p-3 border rounded-lg bg-card">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <h4 class="text-sm font-medium truncate">{listing.name}</h4>
              <p class="text-xs text-muted-foreground">
                {listing.version} by {listing.author}
              </p>
            </div>
            <div class="flex-shrink-0">
              {#if installed && updatable}
                <Button
                  variant="default"
                  size="sm"
                  class="h-7 text-xs"
                  onclick={() => update_plugin(listing.id)}
                  disabled={installing}
                >
                  {#if installing}
                    <Loader2 class="w-3 h-3 animate-spin mr-1" />
                  {:else}
                    <ArrowUpCircle class="w-3 h-3 mr-1" />
                  {/if}
                  Update
                </Button>
              {:else if installed}
                <Button
                  variant="outline"
                  size="sm"
                  class="h-7 text-xs"
                  disabled
                >
                  <Check class="w-3 h-3 mr-1" />
                  Installed
                </Button>
              {:else}
                <Button
                  variant="default"
                  size="sm"
                  class="h-7 text-xs"
                  onclick={() => install_plugin(listing.id)}
                  disabled={installing}
                >
                  {#if installing}
                    <Loader2 class="w-3 h-3 animate-spin mr-1" />
                  {:else}
                    <Download class="w-3 h-3 mr-1" />
                  {/if}
                  Install
                </Button>
              {/if}
            </div>
          </div>
          <p class="mt-2 text-xs text-muted-foreground line-clamp-2">
            {listing.description}
          </p>
        </div>
      {/each}
    </div>
  {/if}
</div>
