<script lang="ts">
  import PluginIframeHost from "./plugin_iframe_host.svelte";
  import type { AppContext } from "$lib/app/di/create_app_context";

  interface Props {
    plugin_id: string;
    vault_path: string;
    services: AppContext["services"];
  }

  let { plugin_id, vault_path, services }: Props = $props();
  const plugin_svc = $derived(services.plugin!);

  let iframe_host: { post_message: (msg: unknown) => void } | undefined =
    $state(undefined);

  $effect(() => {
    if (!iframe_host) return;
    plugin_svc.register_iframe_messenger(plugin_id, (msg) => {
      iframe_host?.post_message(msg);
    });
    return () => plugin_svc.unregister_iframe_messenger(plugin_id);
  });

  function on_message(message: unknown) {
    void plugin_svc.handle_rpc(plugin_id, message as any).then((response) => {
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
