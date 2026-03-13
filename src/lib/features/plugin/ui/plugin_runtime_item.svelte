<script lang="ts">
  import PluginIframeHost from "./plugin_iframe_host.svelte";
  import type { AppContext } from "$lib/app/di/create_app_context";

  interface Props {
    plugin_id: string;
    vault_path: string;
    services: AppContext["services"];
  }

  let { plugin_id, vault_path, services }: Props = $props();

  let iframe_host: { post_message: (msg: unknown) => void } | undefined =
    $state(undefined);

  function on_message(message: unknown) {
    void services.plugin
      .handle_rpc(plugin_id, message as any)
      .then((response) => {
        iframe_host?.post_message(response);
      });
  }
</script>

<PluginIframeHost
  bind:this={iframe_host}
  {plugin_id}
  {vault_path}
  {on_message}
/>
