<script lang="ts">
  import AppShell from "$lib/app/bootstrap/ui/app_shell.svelte";

  type Props = {
    hide_choose_vault_button?: boolean;
  };

  let { hide_choose_vault_button = false }: Props = $props();
</script>

<AppShell {hide_choose_vault_button} />
