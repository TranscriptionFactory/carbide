<script lang="ts">
  import { SendHorizontal } from "@lucide/svelte";
  import * as Select from "$lib/components/ui/select/index.js";
  import { Button } from "$lib/components/ui/button";
  import { Textarea } from "$lib/components/ui/textarea";
  import RagScopeBar from "$lib/features/rag/ui/rag_scope_bar.svelte";
  import type { AiProviderConfig } from "$lib/shared/types/ai_provider_config";
  import type { TagInfo } from "$lib/features/tags";
  import type { SavedViewInfo } from "$lib/features/bases";
  import type { RagScope } from "$lib/features/rag/domain/rag_types";
  import type { RagReadiness } from "$lib/features/rag/types/rag_readiness";

  type Props = {
    providers: AiProviderConfig[];
    provider_id: string;
    scope: RagScope;
    folder_paths: string[];
    tags: TagInfo[];
    saved_views: SavedViewInfo[];
    is_loading: boolean;
    readiness_state: RagReadiness["state"];
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
    readiness_state,
    on_submit,
    on_provider_change,
    on_scope_change,
  }: Props = $props();

  let value = $state("");

  const provider_config = $derived(providers.find((p) => p.id === provider_id));
  const can_submit = $derived(value.trim() !== "" && !is_loading);
  const placeholder = $derived(
    readiness_state === "indexing"
      ? "Ask anything — vault is still indexing, answers may be incomplete…"
      : readiness_state === "checking"
        ? "Checking vault index…"
        : "",
  );

  const EXAMPLE_PROMPTS = [
    "Ask anything about your vault…",
    "What are the main themes across my recent notes?",
    "Summarize everything I've written about this project",
    "What open questions did I leave in my meeting notes?",
    "Find connections between my reading notes and my drafts",
  ];

  let example_index = $state(0);
  let example_visible = $state(true);
  const show_examples = $derived(readiness_state === "ready" && value === "");

  $effect(() => {
    if (!show_examples) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let fade_timer: ReturnType<typeof setTimeout> | undefined;
    const interval = setInterval(() => {
      example_visible = false;
      fade_timer = setTimeout(() => {
        example_index = (example_index + 1) % EXAMPLE_PROMPTS.length;
        example_visible = true;
      }, 500);
    }, 5200);
    return () => {
      clearInterval(interval);
      if (fade_timer) clearTimeout(fade_timer);
      example_visible = true;
    };
  });

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
  <div class="relative">
    <Textarea
      bind:value
      rows={2}
      {placeholder}
      onkeydown={on_keydown}
      class="resize-none text-sm"
    />
    {#if show_examples}
      <span
        class="pointer-events-none absolute left-3 top-2 pr-3 text-sm text-muted-foreground transition-opacity duration-500"
        class:opacity-0={!example_visible}
        aria-hidden="true"
      >
        {EXAMPLE_PROMPTS[example_index]}
      </span>
    {/if}
  </div>
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
