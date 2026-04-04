<script lang="ts">
  import FullAppShell from "$lib/app/full/ui/full_app_shell.svelte";

  type Props = {
    hide_choose_vault_button?: boolean;
  };

  let { hide_choose_vault_button = false }: Props = $props();
</script>

<FullAppShell {hide_choose_vault_button} />
