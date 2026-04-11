<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { create_prod_ports } from "$lib/app/create_prod_ports";
  import { create_app_context } from "$lib/app/di/create_app_context";
  import { provide_app_context } from "$lib/app/context/app_context.svelte";
  import { as_vault_path } from "$lib/shared/types/ids";
  import { AppShell, ViewerShell } from "$lib/app";
  import { parse_window_init } from "$lib/features/window";
  import { to_editor_slash_commands } from "$lib/features/plugin";

  const url_params = new URLSearchParams(window.location.search);
  const vault_path_param = url_params.get("vault_path");
  const file_path_param = url_params.get("file_path");

  const window_init = parse_window_init(url_params);

  const ports = create_prod_ports();

  const app = create_app_context({
    ports,
    now_ms: () => Date.now(),
    default_mount_config: {
      reset_app_state: false,
      bootstrap_default_vault_path: vault_path_param
        ? as_vault_path(vault_path_param)
        : null,
      open_file_after_mount: file_path_param,
      window_kind: window_init.kind,
    },
  });

  ports.slash_command_provider.set_provider(() =>
    to_editor_slash_commands(
      app.stores.plugin.slash_commands,
      (plugin_id, command_name, context) =>
        app.services.plugin.execute_slash_command(
          plugin_id,
          command_name,
          context,
        ),
      (plugin_id) =>
        app.stores.plugin.plugins.get(plugin_id)?.manifest.name ?? plugin_id,
    ),
  );

  provide_app_context(app);

  let destroyed = false;

  onMount(() => {
    const unlisten_promise = getCurrentWindow().onCloseRequested(() => {
      if (!destroyed) {
        destroyed = true;
        app.destroy();
      }
    });
    return () => {
      void unlisten_promise.then((unlisten) => unlisten());
    };
  });

  onDestroy(() => {
    if (!destroyed) {
      destroyed = true;
      app.destroy();
    }
  });
</script>

{#if window_init.kind === "viewer"}
  <ViewerShell />
{:else}
  <AppShell />
{/if}
