<script lang="ts">
  interface Props {
    plugin_id: string;
    vault_path: string;
    on_message: (message: any) => void;
  }

  let { plugin_id, vault_path, on_message }: Props = $props();

  let iframe_element: HTMLIFrameElement | null = $state(null);

  const src = $derived(
    `otterly-plugin://${plugin_id}/index.html?vault=${encodeURIComponent(vault_path)}`,
  );

  const expected_origin = $derived(`otterly-plugin://${plugin_id}`);

  $effect(() => {
    const handle_message = (event: MessageEvent) => {
      if (event.origin !== expected_origin) return;
      if (event.source !== iframe_element?.contentWindow) return;
      on_message(event.data);
    };

    window.addEventListener("message", handle_message);

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
      "otterly:plugin-command" as any,
      handle_plugin_command,
    );

    return () => {
      window.removeEventListener("message", handle_message);
      window.removeEventListener(
        "otterly:plugin-command" as any,
        handle_plugin_command,
      );
    };
  });

  export function post_message(message: any) {
    iframe_element?.contentWindow?.postMessage(message, expected_origin);
  }
</script>

<iframe
  bind:this={iframe_element}
  {src}
  title="Plugin: {plugin_id}"
  sandbox="allow-scripts"
  {...{
    csp: "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; connect-src none;",
  } as any}
  class="w-0 h-0 hidden"
  aria-hidden="true"
></iframe>
