<script lang="ts">
  import PluginIframeHost from "./plugin_iframe_host.svelte";
  import { use_app_context } from "$lib/app/context/app_context.svelte";

  interface Props {
    plugin_id?: string | undefined;
    label?: string | undefined;
  }
  let { plugin_id = "", label = "Plugin Panel" }: Props = $props();

  const { stores, services } = use_app_context();

  const vault_path = $derived(stores.vault.vault?.path ?? "");

  let plugin_iframe: PluginIframeHost | undefined = $state();

  $effect(() => {
    if (!plugin_iframe || !plugin_id) return;
    services.plugin.register_iframe_messenger(plugin_id, (message) => {
      plugin_iframe?.post_message(message);
    });
  });

  function on_message(message: unknown) {
    void services.plugin
      .handle_rpc(plugin_id, message as any)
      .then((response) => {
        plugin_iframe?.post_message(response);
      });
  }
</script>

<div class="flex flex-col h-full">
  <div class="px-4 py-2 border-b">
    <h2 class="text-sm font-semibold">{label}</h2>
  </div>
  <div class="flex-1 min-h-0">
    {#if vault_path && plugin_id}
      <PluginIframeHost
        bind:this={plugin_iframe}
        {plugin_id}
        {vault_path}
        {on_message}
        visible={true}
      />
    {/if}
  </div>
</div>
