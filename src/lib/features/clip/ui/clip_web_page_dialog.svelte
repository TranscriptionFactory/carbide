<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import FolderSuggestInput from "$lib/components/ui/folder_suggest_input.svelte";
  import {
    is_valid_clip_url,
    type ClipFormats,
  } from "$lib/features/clip/domain/clip_note";
  import { tick } from "svelte";

  interface Props {
    open: boolean;
    url: string;
    name: string;
    folder_path: string;
    folder_paths: string[];
    formats: ClipFormats;
    is_clipping: boolean;
    on_update_url: (url: string) => void;
    on_update_name: (name: string) => void;
    on_update_folder: (folder: string) => void;
    on_update_formats: (formats: ClipFormats) => void;
    on_confirm: () => void;
    on_cancel: () => void;
  }

  let {
    open,
    url,
    name,
    folder_path,
    folder_paths,
    formats,
    is_clipping,
    on_update_url,
    on_update_name,
    on_update_folder,
    on_update_formats,
    on_confirm,
    on_cancel,
  }: Props = $props();

  let input_el = $state<HTMLInputElement | null>(null);

  $effect(() => {
    if (open && input_el) {
      const el = input_el;
      void tick().then(() => {
        el.focus();
      });
    }
  });

  const has_format = $derived(formats.markdown || formats.html || formats.epub);
  const is_valid = $derived(is_valid_clip_url(url.trim()) && has_format);

  const format_options: Array<{ key: keyof ClipFormats; label: string }> = [
    { key: "markdown", label: "Markdown note" },
    { key: "html", label: "HTML artifact" },
    { key: "epub", label: "EPUB" },
  ];

  function toggle_format(key: keyof ClipFormats, checked: boolean) {
    on_update_formats({ ...formats, [key]: checked });
  }
</script>

<Dialog.Root
  {open}
  onOpenChange={(value: boolean) => {
    if (!value && !is_clipping) on_cancel();
  }}
>
  <Dialog.Content class="max-w-md">
    <Dialog.Header>
      <Dialog.Title>Clip Web Page</Dialog.Title>
      <Dialog.Description>
        Save a web page into the vault in one or more formats.
      </Dialog.Description>
    </Dialog.Header>

    <div class="space-y-4">
      <div>
        <span class="text-sm text-muted-foreground">URL</span>
        <Input
          bind:ref={input_el}
          value={url}
          placeholder="https://example.com/article"
          disabled={is_clipping}
          oninput={(event: Event) =>
            on_update_url((event.currentTarget as HTMLInputElement).value)}
          onkeydown={(event: KeyboardEvent) => {
            if (event.key === "Enter" && is_valid && !is_clipping) {
              event.preventDefault();
              on_confirm();
            }
          }}
        />
      </div>
      <div>
        <span class="text-sm text-muted-foreground">Name</span>
        <Input
          value={name}
          placeholder="Page title (auto)"
          disabled={is_clipping}
          oninput={(event: Event) =>
            on_update_name((event.currentTarget as HTMLInputElement).value)}
        />
      </div>
      <div>
        <span class="text-sm text-muted-foreground">Location</span>
        <FolderSuggestInput
          value={folder_path}
          {folder_paths}
          on_change={on_update_folder}
          disabled={is_clipping}
          placeholder="(vault root)"
        />
      </div>
      <fieldset class="space-y-2">
        <legend class="text-sm text-muted-foreground">Save as</legend>
        {#each format_options as option (option.key)}
          <label class="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              class="size-4 accent-primary"
              checked={formats[option.key]}
              disabled={is_clipping}
              onchange={(event: Event) =>
                toggle_format(
                  option.key,
                  (event.currentTarget as HTMLInputElement).checked,
                )}
            />
            {option.label}
          </label>
        {/each}
      </fieldset>
    </div>

    <Dialog.Footer>
      <Button variant="outline" onclick={on_cancel} disabled={is_clipping}>
        Cancel
      </Button>
      <Button
        variant="default"
        onclick={on_confirm}
        disabled={!is_valid || is_clipping}
      >
        {is_clipping ? "Clipping..." : "Clip"}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
