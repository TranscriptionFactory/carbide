<script lang="ts">
  import PluginRuntimeItem from "./plugin_runtime_item.svelte";
  import { use_app_context } from "$lib/app/context/app_context.svelte";

  const { stores, services } = use_app_context();

  const active_ids = $derived(stores.plugin.active_plugin_ids);
  const vault_path = $derived(stores.vault.vault?.path ?? "");
</script>

{#each active_ids as id (id)}
  <PluginRuntimeItem plugin_id={id} {vault_path} {services} />
{/each}
