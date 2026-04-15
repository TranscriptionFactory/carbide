<script lang="ts">
  import SandboxedIframe from "$lib/shared/ui/sandboxed_iframe.svelte";
  import { use_app_context } from "$lib/app/context/app_context.svelte";

  interface Props {
    plugin_id?: string | undefined;
    label?: string | undefined;
  }
  let { plugin_id = "", label = "Plugin Panel" }: Props = $props();

  const { stores, services } = use_app_context();

  const vault_path = $derived(stores.vault.vault?.path ?? "");

  const src = $derived(
    vault_path
      ? `carbide-plugin://${plugin_id}/index.html?vault=${encodeURIComponent(vault_path)}`
      : "",
  );
  const expected_origin = $derived(`carbide-plugin://${plugin_id}`);

  let sandboxed_iframe: SandboxedIframe | undefined = $state();

  $effect(() => {
    if (!sandboxed_iframe || !plugin_id) return;

    services.plugin.register_iframe_messenger(plugin_id, (msg) => {
      sandboxed_iframe?.post_message(msg);
    });

    const timer = setTimeout(() => {
      sandboxed_iframe?.post_message({
        method: "lifecycle.activate",
        params: [],
      });
    }, 0);

    return () => {
      clearTimeout(timer);
      sandboxed_iframe?.post_message({
        method: "lifecycle.deactivate",
        params: [],
      });
    };
  });

  $effect(() => {
    if (!plugin_id) return;

    const handle_plugin_command = (event: any) => {
      const { plugin_id: target, command_id } = event.detail;
      if (target === plugin_id) {
        sandboxed_iframe?.post_message({
          method: "command.execute",
          params: [command_id],
        });
      }
    };

    window.addEventListener(
      "carbide:plugin-command" as any,
      handle_plugin_command,
    );

    return () => {
      window.removeEventListener(
        "carbide:plugin-command" as any,
        handle_plugin_command,
      );
    };
  });

  function on_message(message: unknown) {
    void services.plugin
      .handle_rpc(plugin_id, message as any)
      .then((response) => {
        sandboxed_iframe?.post_message(response);
      });
  }
</script>

<div class="flex flex-col h-full">
  <div class="px-4 py-2 border-b">
    <h2 class="text-sm font-semibold">{label}</h2>
  </div>
  <div class="flex-1 min-h-0">
    {#if src}
      <SandboxedIframe
        bind:this={sandboxed_iframe}
        {src}
        origin={expected_origin}
        title="Plugin: {plugin_id}"
        {on_message}
        visible={true}
        class="w-full h-full border-0"
      />
    {/if}
  </div>
</div>
