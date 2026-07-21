<script lang="ts">
  import { tick } from "svelte";
  import { FileText, SendHorizontal, Square, X } from "@lucide/svelte";
  import * as Select from "$lib/components/ui/select/index.js";
  import { Button } from "$lib/components/ui/button";
  import { Textarea } from "$lib/components/ui/textarea";
  import { DslSuggestController } from "$lib/components/ui/dsl_suggest.svelte";
  import DslSuggestDropdown from "$lib/components/ui/dsl_suggest_dropdown.svelte";
  import RagScopeBar from "$lib/features/rag/ui/rag_scope_bar.svelte";
  import type { AiProviderConfig } from "$lib/shared/types/ai_provider_config";
  import type { TagInfo } from "$lib/features/tags";
  import type { SavedViewInfo } from "$lib/features/bases";
  import type {
    DslSuggestion,
    DslSuggestResult,
  } from "$lib/shared/types/dsl_suggestion";
  import type { RagScope } from "$lib/features/rag/domain/rag_types";
  import {
    format_mention_token,
    parse_mentions,
    strip_mention,
  } from "$lib/features/rag/domain/rag_mentions";
  import type { RagReadiness } from "$lib/features/rag/types/rag_readiness";

  type MentionSuggestion = { path: string; title: string };

  type Props = {
    providers: AiProviderConfig[];
    provider_id: string;
    scope: RagScope;
    folder_paths: string[];
    tags: TagInfo[];
    saved_views: SavedViewInfo[];
    is_loading: boolean;
    is_streaming: boolean;
    readiness_state: RagReadiness["state"];
    suggest_notes: (partial: string) => Promise<MentionSuggestion[]>;
    on_submit: (question: string) => void;
    on_stop: () => void;
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
    is_streaming,
    readiness_state,
    suggest_notes,
    on_submit,
    on_stop,
    on_provider_change,
    on_scope_change,
  }: Props = $props();

  let value = $state("");
  let textarea_el = $state<HTMLTextAreaElement | null>(null);

  const MENTION_TRIGGER_RE = /(^|\s)@([^\s@]*)$/;

  let mention_items: DslSuggestion[] = [];
  let fetch_token = 0;

  function mention_provider(text_before_cursor: string): DslSuggestResult {
    const match = MENTION_TRIGGER_RE.exec(text_before_cursor);
    if (!match) return { from: text_before_cursor.length, items: [] };
    const partial = match[2] ?? "";
    return {
      from: text_before_cursor.length - partial.length - 1,
      items: mention_items,
    };
  }

  const suggest = new DslSuggestController({
    provider: mention_provider,
    get_ctx: () => ({}),
    apply: apply_suggestion,
  });

  function before_cursor(): string {
    const cursor = textarea_el?.selectionStart ?? value.length;
    return value.slice(0, cursor);
  }

  async function apply_suggestion(from: number, insert: string) {
    fetch_token += 1;
    const el = textarea_el;
    const cursor = el?.selectionStart ?? value.length;
    value = value.slice(0, from) + insert + value.slice(cursor);
    const next = from + insert.length;
    await tick();
    el?.setSelectionRange(next, next);
    el?.focus();
  }

  async function refresh_mentions() {
    const match = MENTION_TRIGGER_RE.exec(before_cursor());
    if (!match) {
      mention_items = [];
      suggest.close();
      return;
    }
    const token = ++fetch_token;
    const notes = await suggest_notes(match[2] ?? "");
    if (token !== fetch_token) return;
    mention_items = notes.map((note) => ({
      label: note.title,
      insert: `${format_mention_token(note.path)} `,
      detail: note.path,
    }));
    suggest.update(before_cursor());
  }

  const mention_chips = $derived(parse_mentions(value).mentions);

  function remove_mention(mention: string) {
    value = strip_mention(value, mention);
  }

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
    fetch_token += 1;
    suggest.close();
    on_submit(value.trim());
    value = "";
  }

  function on_keydown(event: KeyboardEvent) {
    if (suggest.keydown(event)) return;
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }
</script>

<div class="flex flex-col gap-2 border-t p-2">
  {#if mention_chips.length > 0}
    <div class="RagInput__chips">
      {#each mention_chips as mention (mention)}
        <span class="RagInput__chip">
          <FileText class="size-3" />
          <span class="RagInput__chip-label">{mention}</span>
          <button
            type="button"
            class="RagInput__chip-remove"
            aria-label="Remove mention"
            onclick={() => remove_mention(mention)}
          >
            <X class="size-3" />
          </button>
        </span>
      {/each}
    </div>
  {/if}
  <div class="RagInput__field relative">
    <Textarea
      bind:value
      bind:ref={textarea_el}
      rows={2}
      {placeholder}
      onkeydown={on_keydown}
      oninput={() => void refresh_mentions()}
      onblur={() => suggest.close()}
      class="resize-none text-sm"
    />
    {#if suggest.open}
      <DslSuggestDropdown
        items={suggest.items}
        selected_index={suggest.selected_index}
        on_select={(i) => suggest.accept(i)}
      />
    {/if}
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

    {#if is_loading || is_streaming}
      <Button size="sm" variant="secondary" onclick={on_stop} title="Stop">
        <Square class="size-4" />
      </Button>
    {:else}
      <Button size="sm" disabled={!can_submit} onclick={submit}>
        <SendHorizontal class="size-4" />
        Ask
      </Button>
    {/if}
  </div>
</div>

<style>
  div.RagInput__field :global(.DslSuggest__dropdown) {
    top: auto;
    bottom: calc(100% + 4px);
  }

  .RagInput__chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }

  .RagInput__chip {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.125rem 0.25rem 0.125rem 0.375rem;
    border-radius: calc(var(--radius) - 4px);
    background: var(--accent);
    color: var(--accent-foreground);
    font-size: 0.75rem;
    max-width: 100%;
  }

  .RagInput__chip-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .RagInput__chip-remove {
    all: unset;
    cursor: pointer; /* all:unset beats the global :where() cursor rule */
    display: inline-flex;
    align-items: center;
    color: var(--muted-foreground);
  }

  .RagInput__chip-remove:hover {
    color: var(--foreground);
  }
</style>
