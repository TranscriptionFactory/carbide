<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { tick, untrack } from "svelte";

  interface Props {
    open: boolean;
    folder_path: string;
    canvas_name: string;
    on_name_change: (name: string) => void;
    on_confirm: () => void;
    on_cancel: () => void;
  }

  let {
    open,
    folder_path,
    canvas_name,
    on_name_change,
    on_confirm,
    on_cancel,
  }: Props = $props();

  let input_el = $state<HTMLInputElement | null>(null);

  const is_valid = $derived(canvas_name.trim().length > 0);

  $effect(() => {
    if (open) {
      void tick().then(() => {
        const el = untrack(() => input_el);
        if (el) {
          el.focus();
          el.select();
        }
      });
    }
  });
</script>

<Dialog.Root
  {open}
  onOpenChange={(value: boolean) => {
    if (!value) on_cancel();
  }}
>
  <Dialog.Content class="max-w-md">
    <Dialog.Header>
      <Dialog.Title>New Canvas</Dialog.Title>
      <Dialog.Description>
        Enter a name for your canvas drawing.
      </Dialog.Description>
    </Dialog.Header>

    <div class="space-y-4">
      {#if folder_path}
        <p class="text-sm text-muted-foreground">Location: {folder_path}/</p>
      {/if}
      <div class="flex items-center">
        <Input
          bind:ref={input_el}
          type="text"
          value={canvas_name}
          oninput={(e: Event & { currentTarget: HTMLInputElement }) => {
            on_name_change(e.currentTarget.value);
          }}
          onkeydown={(e: KeyboardEvent) => {
            if (e.key === "Enter" && is_valid) {
              e.preventDefault();
              on_confirm();
            }
          }}
          placeholder="e.g., architecture-diagram"
          class="rounded-r-none"
        />
        <span
          class="px-3 py-2 bg-muted text-muted-foreground border border-l-0 rounded-r-md text-sm"
        >
          .excalidraw
        </span>
      </div>
    </div>

    <Dialog.Footer>
      <Button variant="outline" onclick={on_cancel}>Cancel</Button>
      <Button variant="default" onclick={on_confirm} disabled={!is_valid}>
        Create
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
