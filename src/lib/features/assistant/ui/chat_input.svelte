<script lang="ts">
  import { tick, untrack } from "svelte";
  import { FileText, PenLine, SendHorizontal, Square, X } from "@lucide/svelte";
  import * as Select from "$lib/components/ui/select/index.js";
  import { Button } from "$lib/components/ui/button";
  import { Textarea } from "$lib/components/ui/textarea";
  import { DslSuggestController } from "$lib/components/ui/dsl_suggest.svelte";
  import DslSuggestDropdown from "$lib/components/ui/dsl_suggest_dropdown.svelte";
  import ChatScopeBar from "$lib/features/assistant/ui/chat_scope_bar.svelte";
  import type { AiProviderConfig } from "$lib/shared/types/ai_provider_config";
  import { is_plain_enter } from "$lib/shared/utils/keyboard";
  import { filter_folder_paths } from "$lib/shared/utils/filter_folder_paths";
  import type { TagInfo } from "$lib/features/tags";
  import type { SavedViewInfo } from "$lib/features/bases";
  import type {
    DslSuggestion,
    DslSuggestResult,
  } from "$lib/shared/types/dsl_suggestion";
  import type {
    AssistantChatMode,
    AssistantScope,
  } from "$lib/features/assistant/types/session";
  import {
    format_mention_token,
    parse_mentions,
    strip_mention,
  } from "$lib/features/assistant/domain/mention_tokens";
  import type { RetrievalReadiness } from "$lib/features/assistant/types/retrieval";

  type MentionSuggestion = { path: string; title: string };

  type Props = {
    providers: AiProviderConfig[];
    provider_id: string;
    scope: AssistantScope;
    folder_paths: string[];
    tags: TagInfo[];
    saved_views: SavedViewInfo[];
    active_note_path: string | null;
    is_loading: boolean;
    is_streaming: boolean;
    readiness_state: RetrievalReadiness["state"];
    mode: AssistantChatMode;
    suggest_notes: (partial: string) => Promise<MentionSuggestion[]>;
    on_submit: (question: string) => void;
    on_stop: () => void;
    on_provider_change: (provider_id: string) => void;
    on_scope_change: (scope: AssistantScope) => void;
    active_document?: { path: string; title: string } | null;
    attached_document?:
      | import("$lib/features/assistant/types/attachment").DocumentAttachment
      | null;
    attached_open?: boolean;
    on_attach_document?: (() => void) | undefined;
    on_detach_document?: (() => void) | undefined;
    // Secondary submit (pin 5): present only where the panel can edit the
    // open tab.
    can_edit?: boolean;
    on_edit?: ((instructions: string) => void) | undefined;
    // A queued prompt handed back by a stopped or failed turn, consumed once.
    restore_text?: string | null;
    on_restore_consumed?: (() => void) | undefined;
  };

  let {
    providers,
    provider_id,
    scope,
    folder_paths,
    tags,
    saved_views,
    active_note_path,
    is_loading,
    is_streaming,
    readiness_state,
    mode,
    suggest_notes,
    on_submit,
    on_stop,
    on_provider_change,
    on_scope_change,
    active_document = null,
    attached_document = null,
    attached_open = true,
    on_attach_document = undefined,
    on_detach_document = undefined,
    can_edit = false,
    on_edit = undefined,
    restore_text = null,
    on_restore_consumed = undefined,
  }: Props = $props();

  let value = $state("");
  let textarea_el = $state<HTMLTextAreaElement | null>(null);

  const MENTION_TRIGGER_RE = /(^|\s)@([^\s@]*)$/;

  let mention_items: DslSuggestion[] = [];
  let mention_error = $state<string | null>(null);
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

  async function apply_suggestion(
    from: number,
    insert: string,
    item?: DslSuggestion,
  ) {
    fetch_token += 1;
    if (item?.kind === "folder") {
      const folders = scope.folders ?? [];
      if (!folders.includes(insert)) {
        on_scope_change({ ...scope, folders: [...folders, insert] });
      }
      value =
        value.slice(0, from) +
        value.slice(textarea_el?.selectionStart ?? value.length);
      mention_error = null;
      await tick();
      textarea_el?.focus();
      return;
    }
    const el = textarea_el;
    const cursor = el?.selectionStart ?? value.length;
    value = value.slice(0, from) + insert + value.slice(cursor);
    const next = from + insert.length;
    await tick();
    el?.setSelectionRange(next, next);
    el?.focus();
  }

  async function refresh_mentions() {
    mention_error = null;
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
      kind: "note",
    }));
    if (mode !== "agent") {
      mention_items.push(
        ...filter_folder_paths(match[2] ?? "", folder_paths).map((path) => ({
          label: path || "(vault root)",
          insert: path,
          detail: "Folder scope",
          kind: "folder" as const,
        })),
      );
    }
    suggest.update(before_cursor());
  }

  const mention_chips = $derived(parse_mentions(value).mentions);

  function remove_mention(mention: string) {
    value = strip_mention(value, mention);
  }

  const provider_config = $derived(providers.find((p) => p.id === provider_id));
  // Submission stays open during a turn: the action queues it rather than
  // dropping it, so gating here would remove the capability instead of fixing
  // the loss.
  const can_submit = $derived(value.trim() !== "");
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

  // Restored text is merged above whatever the user has typed since queueing,
  // so getting a prompt back never costs them the one they are writing.
  $effect(() => {
    const restored = restore_text;
    if (restored === null) return;
    untrack(() => {
      value = value.trim() === "" ? restored : `${restored}\n${value}`;
    });
    on_restore_consumed?.();
  });

  // Auto-grow: the textarea has no intrinsic content sizing, so height is
  // measured from the content and capped by the element's max-height.
  $effect(() => {
    void value;
    const el = textarea_el;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  });

  function dispatch(handler: (text: string) => void) {
    if (!can_submit) return;
    const folder_mentions = parse_mentions(value).mentions.filter((mention) =>
      mention.endsWith("/"),
    );
    const unresolved = folder_mentions.find(
      (mention) => !folder_paths.includes(mention.replace(/\/$/, "")),
    );
    if (unresolved) {
      mention_error = `Folder not found: ${unresolved}`;
      return;
    }
    if (folder_mentions.length > 0) {
      const folders = [...(scope.folders ?? [])];
      for (const mention of folder_mentions) {
        const folder = mention.replace(/\/$/, "");
        if (!folders.includes(folder)) folders.push(folder);
        value = strip_mention(value, mention);
      }
      on_scope_change({ ...scope, folders });
    }
    fetch_token += 1;
    suggest.close();
    if (value.trim()) handler(value.trim());
    value = "";
    mention_error = null;
  }

  function submit() {
    dispatch(on_submit);
  }

  function edit() {
    if (on_edit) dispatch(on_edit);
  }

  function on_keydown(event: KeyboardEvent) {
    if (suggest.keydown(event)) return;
    if (is_plain_enter(event)) {
      event.preventDefault();
      submit();
    }
  }
</script>

<div class="flex flex-col gap-2 p-2">
  {#if mention_chips.length > 0}
    <div class="ChatInput__chips">
      {#each mention_chips as mention (mention)}
        <span class="ChatInput__chip">
          <FileText class="size-3" />
          <span class="ChatInput__chip-label">{mention}</span>
          <button
            type="button"
            class="ChatInput__chip-remove"
            aria-label="Remove mention"
            onclick={() => remove_mention(mention)}
          >
            <X class="size-3" />
          </button>
        </span>
      {/each}
    </div>
  {/if}
  <div class="ChatInput__field relative">
    <!-- 38px floor: autogrow writes scrollHeight, which excludes the 2px
         border that preflight's border-box sizing makes the floor absorb --
         18.57 line + 16 padding + 2 border = 36.57, so min-h-9 clips and
         min-h-10 overshoots. -->
    <Textarea
      bind:value
      bind:ref={textarea_el}
      {placeholder}
      onkeydown={on_keydown}
      oninput={() => void refresh_mentions()}
      onblur={() => suggest.close()}
      class="max-h-48 min-h-[38px] resize-none text-sm"
    />
    {#if suggest.open}
      <DslSuggestDropdown
        items={suggest.items}
        selected_index={suggest.selected_index}
        on_select={(i) => suggest.accept(i)}
      />
    {/if}
    {#if mention_error}
      <p class="mt-1 text-xs text-destructive" role="alert">{mention_error}</p>
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
  <!-- Scope narrows retrieval, which agent turns don't run — the bar is inert
       there and hidden rather than misleading. -->
  {#if mode !== "agent"}
    <ChatScopeBar
      {scope}
      {folder_paths}
      {tags}
      {saved_views}
      {active_note_path}
      {on_scope_change}
      {active_document}
      {attached_document}
      {attached_open}
      {on_attach_document}
      {on_detach_document}
    />
  {/if}
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
      <div class="flex items-center gap-1">
        {#if can_edit && on_edit}
          <Button
            size="sm"
            variant="secondary"
            disabled={!can_submit}
            data-testid="chat-input-edit"
            title="Propose an edit to the open tab"
            onclick={edit}
          >
            <PenLine class="size-4" />
            Edit
          </Button>
        {/if}
        <Button size="sm" disabled={!can_submit} onclick={submit}>
          <SendHorizontal class="size-4" />
          {mode === "agent" ? "Run" : "Ask"}
        </Button>
      </div>
    {/if}
  </div>
</div>

<style>
  div.ChatInput__field :global(.DslSuggest__dropdown) {
    top: auto;
    bottom: calc(100% + 4px);
  }

  .ChatInput__chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }

  .ChatInput__chip {
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

  .ChatInput__chip-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ChatInput__chip-remove {
    all: unset;
    cursor: pointer; /* all:unset beats the global :where() cursor rule */
    display: inline-flex;
    align-items: center;
    color: var(--muted-foreground);
  }

  .ChatInput__chip-remove:hover {
    color: var(--foreground);
  }
</style>
