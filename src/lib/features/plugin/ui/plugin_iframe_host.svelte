<script lang="ts">
  import SandboxedIframe from "$lib/shared/ui/sandboxed_iframe.svelte";

  interface Props {
    plugin_id: string;
    vault_path: string;
    on_message: (message: any) => void;
  }

  let { plugin_id, vault_path, on_message }: Props = $props();

  let sandboxed_iframe: SandboxedIframe | undefined = $state();

  const src = $derived(
    `carbide-plugin://${plugin_id}/index.html?vault=${encodeURIComponent(vault_path)}`,
  );

  const expected_origin = $derived(`carbide-plugin://${plugin_id}`);

  $effect(() => {
    const handle_plugin_command = (event: any) => {
      const { plugin_id: target_plugin_id, command_id } = event.detail;
      if (target_plugin_id === plugin_id) {
        post_message({
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

  $effect(() => {
    if (!sandboxed_iframe) return;

    const timer = setTimeout(() => {
      post_message({ method: "lifecycle.activate", params: [] });
    }, 0);

    return () => {
      clearTimeout(timer);
      post_message({ method: "lifecycle.deactivate", params: [] });
    };
  });

  export function post_message(message: any) {
    sandboxed_iframe?.post_message(message);
  }
</script>

<SandboxedIframe
  bind:this={sandboxed_iframe}
  {src}
  origin={expected_origin}
  title="Plugin: {plugin_id}"
  {on_message}
  class="w-0 h-0 hidden"
/>
