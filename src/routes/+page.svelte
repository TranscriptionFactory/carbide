<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { create_prod_ports } from "$lib/app/create_prod_ports";
  import { provide_app_context } from "$lib/app/context/app_context.svelte";
  import { as_vault_path } from "$lib/shared/types/ids";
  import {
    create_full_app_context,
    create_lite_app_context,
    FullAppShell,
    FullViewerShell,
    LiteAppShell,
    LiteViewerShell,
  } from "$lib/app";
  import { parse_app_target, parse_window_init } from "$lib/features/window";

  const url_params = new URLSearchParams(window.location.search);
  const vault_path_param = url_params.get("vault_path");
  const file_path_param = url_params.get("file_path");

  const app_target = parse_app_target(url_params);
  const window_init = parse_window_init(url_params);

  const ports = create_prod_ports();

  const app_context_input = {
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
  };

  const app =
    app_target === "lite"
      ? create_lite_app_context(app_context_input)
      : create_full_app_context(app_context_input);

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
  {#if app_target === "lite"}
    <LiteViewerShell />
  {:else}
    <FullViewerShell />
  {/if}
{:else if app_target === "lite"}
  <LiteAppShell />
{:else}
  <FullAppShell />
{/if}
