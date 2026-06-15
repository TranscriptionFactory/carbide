<script lang="ts">
  import { SendHorizontal } from "@lucide/svelte";
  import * as Select from "$lib/components/ui/select/index.js";
  import { Button } from "$lib/components/ui/button";
  import { Textarea } from "$lib/components/ui/textarea";
  import RagScopeBar from "$lib/features/rag/ui/rag_scope_bar.svelte";
  import type { AiProviderConfig } from "$lib/shared/types/ai_provider_config";
  import type { TagInfo } from "$lib/features/tags/types";
  import type { SavedViewInfo } from "$lib/features/bases/ports";
  import type { RagScope } from "$lib/features/rag/domain/rag_types";

  type Props = {
    providers: AiProviderConfig[];
    provider_id: string;
    scope: RagScope;
    folder_paths: string[];
    tags: TagInfo[];
    saved_views: SavedViewInfo[];
    is_loading: boolean;
    on_submit: (question: string) => void;
    on_provider_change: (provider_id: string) => void;
    on_scope_change: (scope: RagScope) => void;
  };

  let {
    providers,
    provider_id,
    scope,
    folder_paths,
    tags,
    saved_views,
    is_loading,
    on_submit,
    on_provider_change,
    on_scope_change,
  }: Props = $props();

  let value = $state("");

  const provider_config = $derived(providers.find((p) => p.id === provider_id));
  const can_submit = $derived(value.trim() !== "" && !is_loading);

  function submit() {
    if (!can_submit) return;
    on_submit(value.trim());
    value = "";
  }

  function on_keydown(event: KeyboardEvent) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }
</script>

<div class="flex flex-col gap-2 border-t p-2">
  <Textarea
    bind:value
    rows={2}
    placeholder="Ask anything about your vault…"
    onkeydown={on_keydown}
    class="resize-none text-sm"
  />
  <RagScopeBar {scope} {folder_paths} {tags} {saved_views} {on_scope_change} />
  <div class="flex items-center justify-between gap-2">
    <Select.Root
      type="single"
      value={provider_id}
      onValueChange={(next: string | undefined) => {
        if (next) on_provider_change(next);
      }}
    >
      <Select.Trigger class="h-8 w-36">
        <span data-slot="select-value"
          >{provider_config?.name ?? provider_id ?? "Provider"}</span
        >
      </Select.Trigger>
      <Select.Content>
        {#each providers as p (p.id)}
          <Select.Item value={p.id}>{p.name}</Select.Item>
        {/each}
      </Select.Content>
    </Select.Root>

    <Button size="sm" disabled={!can_submit} onclick={submit}>
      <SendHorizontal class="size-4" />
      Ask
    </Button>
  </div>
</div>
