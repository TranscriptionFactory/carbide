<script lang="ts">
  import SandboxedIframe from "$lib/shared/ui/sandboxed_iframe.svelte";

  interface Props {
    plugin_id: string;
    vault_path: string;
    on_message: (message: any) => void;
    visible?: boolean;
  }

  let { plugin_id, vault_path, on_message, visible = false }: Props = $props();

  let sandboxed_iframe: SandboxedIframe | undefined = $state();
  let should_activate = $state(false);
  let loaded_src = $state("");

  const src = $derived(
    `carbide-plugin://${plugin_id}/index.html?vault=${encodeURIComponent(vault_path)}&surface=${visible ? "panel" : "runtime"}`,
  );

  const expected_origin = $derived(`carbide-plugin://${plugin_id}`);

  $effect(() => {
    const handle_plugin_command = (event: any) => {
      const { plugin_id: target_plugin_id, command_id } = event.detail;
      if (target_plugin_id !== plugin_id) return;
      if (visible && loaded_src === src) {
        event.detail.plugin_panel_ready = true;
        post_message({ method: "command.execute", params: [command_id] });
      } else if (!visible) {
        queueMicrotask(() => {
          post_message({
            method: "command.execute",
            params: [
              command_id,
              { panel_ready: event.detail.plugin_panel_ready === true },
            ],
          });
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
    should_activate = true;

    return () => {
      should_activate = false;
      post_message({ method: "lifecycle.deactivate", params: [] });
    };
  });

  function send_theme() {
    const root = document.documentElement;
    const style = getComputedStyle(root);
    const tokens = Object.fromEntries(
      [
        "background",
        "foreground",
        "muted",
        "muted-foreground",
        "primary",
        "primary-foreground",
        "accent",
        "accent-foreground",
        "border",
        "input",
        "ring",
        "destructive",
      ].map((name) => [
        `--${name}`,
        style.getPropertyValue(`--${name}`).trim(),
      ]),
    );
    post_message({
      method: "theme.update",
      params: [tokens, style.colorScheme],
    });
  }

  $effect(() => {
    if (!sandboxed_iframe) return;
    const observer = new MutationObserver(send_theme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style"],
    });
    return () => observer.disconnect();
  });

  function handle_iframe_load() {
    loaded_src = src;
    send_theme();
    if (should_activate) {
      post_message({ method: "lifecycle.activate", params: [] });
    }
  }

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
  on_load={handle_iframe_load}
  {visible}
  class={visible ? "w-full h-full border-0" : "w-0 h-0 hidden"}
/>
