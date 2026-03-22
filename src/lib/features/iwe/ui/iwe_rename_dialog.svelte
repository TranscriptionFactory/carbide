<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import { ACTION_IDS } from "$lib/app";

  const { stores, action_registry } = use_app_context();

  const dialog = $derived(stores.ui.iwe_rename_dialog);

  function on_confirm() {
    if (!dialog.new_name || dialog.new_name === dialog.placeholder) return;
    void action_registry.execute(ACTION_IDS.iwe_rename_confirm);
  }

  function on_cancel() {
    stores.ui.iwe_rename_dialog = {
      open: false,
      file_path: "",
      line: 0,
      character: 0,
      placeholder: "",
      new_name: "",
    };
  }
</script>

<Dialog.Root
  open={dialog.open}
  onOpenChange={(open) => {
    if (!open) on_cancel();
  }}
>
  <Dialog.Content class="sm:max-w-[425px]">
    <Dialog.Header>
      <Dialog.Title>Rename Symbol</Dialog.Title>
      <Dialog.Description>Enter a new name for this symbol.</Dialog.Description>
    </Dialog.Header>
    <div class="IweRenameDialog__body">
      <Input
        value={dialog.new_name}
        oninput={(e: Event) => {
          const target = e.target as HTMLInputElement;
          stores.ui.iwe_rename_dialog = {
            ...stores.ui.iwe_rename_dialog,
            new_name: target.value,
          };
        }}
        onkeydown={(e: KeyboardEvent) => {
          if (e.key === "Enter") {
            e.preventDefault();
            on_confirm();
          }
        }}
        placeholder={dialog.placeholder}
        autofocus
      />
    </div>
    <Dialog.Footer>
      <Button variant="outline" onclick={on_cancel}>Cancel</Button>
      <Button
        onclick={on_confirm}
        disabled={!dialog.new_name || dialog.new_name === dialog.placeholder}
      >
        Rename
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<style>
  .IweRenameDialog__body {
    padding: var(--space-4) 0;
  }
</style>
