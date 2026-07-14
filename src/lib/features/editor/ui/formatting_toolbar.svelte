<script lang="ts">
  import {
    Bold,
    Italic,
    Strikethrough,
    Code,
    Link,
    Heading1,
    Heading2,
    Heading3,
    List,
    ListOrdered,
    Quote,
    Code2,
    Table,
    Minus,
    Image,
    Undo,
    Redo,
  } from "@lucide/svelte";
  import type { EditorView } from "prosemirror-view";
  import {
    type FormattingCommand,
    get_active_marks,
    is_block_command_active,
    is_command_available,
    link_selection_state,
    apply_link,
    remove_link,
  } from "../adapters/formatting_toolbar_commands";
  import { shortcut_hint } from "./formatting_shortcuts";

  interface Props {
    get_view: () => EditorView | null;
    get_state_version: () => number;
    on_command: (command: FormattingCommand) => void;
    on_image_pick?: () => Promise<void>;
  }

  let { get_view, get_state_version, on_command, on_image_pick }: Props =
    $props();

  let link_popover_open = $state(false);
  let link_input_value = $state("");
  let link_has_existing = $state(false);
  let link_input_el = $state<HTMLInputElement | null>(null);

  type ToolbarButton = {
    id: FormattingCommand;
    icon: typeof Bold;
    label: string;
    mark_name?: string;
    group: "history" | "marks" | "headings" | "blocks" | "insert";
  };

  const buttons: ToolbarButton[] = [
    { id: "undo", icon: Undo, label: "Undo", group: "history" },
    { id: "redo", icon: Redo, label: "Redo", group: "history" },
    {
      id: "bold",
      icon: Bold,
      label: "Bold",
      mark_name: "strong",
      group: "marks",
    },
    {
      id: "italic",
      icon: Italic,
      label: "Italic",
      mark_name: "em",
      group: "marks",
    },
    {
      id: "strikethrough",
      icon: Strikethrough,
      label: "Strikethrough",
      mark_name: "strikethrough",
      group: "marks",
    },
    {
      id: "code",
      icon: Code,
      label: "Inline Code",
      mark_name: "code_inline",
      group: "marks",
    },
    { id: "link", icon: Link, label: "Link", group: "marks" },
    { id: "heading1", icon: Heading1, label: "Heading 1", group: "headings" },
    { id: "heading2", icon: Heading2, label: "Heading 2", group: "headings" },
    { id: "heading3", icon: Heading3, label: "Heading 3", group: "headings" },
    { id: "blockquote", icon: Quote, label: "Blockquote", group: "blocks" },
    { id: "bullet_list", icon: List, label: "Bullet List", group: "blocks" },
    {
      id: "ordered_list",
      icon: ListOrdered,
      label: "Numbered List",
      group: "blocks",
    },
    { id: "code_block", icon: Code2, label: "Code Block", group: "blocks" },
    { id: "table", icon: Table, label: "Table", group: "insert" },
    {
      id: "horizontal_rule",
      icon: Minus,
      label: "Horizontal Rule",
      group: "insert",
    },
    { id: "image", icon: Image, label: "Image", group: "insert" },
  ];

  const groups = $derived([
    "history",
    "marks",
    "headings",
    "blocks",
    "insert",
  ] as const);

  const active_marks = $derived.by(() => {
    get_state_version();
    const view = get_view();
    return view ? get_active_marks(view) : new Set<string>();
  });

  $effect(() => {
    get_state_version();
    const view = get_view();
    if (!view) return;
    const handle_keydown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (link_popover_open) close_link_popover();
        else open_link_popover();
      }
    };
    view.dom.addEventListener("keydown", handle_keydown);
    return () => view.dom.removeEventListener("keydown", handle_keydown);
  });

  function is_button_active(button: ToolbarButton): boolean {
    if (button.id === "link") return link_popover_open;
    if (button.mark_name) return active_marks.has(button.mark_name);
    const view = get_view();
    return view ? is_block_command_active(button.id, view) : false;
  }

  function open_link_popover() {
    const view = get_view();
    if (!view) return;
    const link_state = link_selection_state(view);
    if (!link_state.can_edit) return;
    link_input_value = link_state.existing_href ?? "";
    link_has_existing = link_state.existing_href !== null;
    link_popover_open = true;
    queueMicrotask(() => link_input_el?.focus());
  }

  function close_link_popover() {
    link_popover_open = false;
    get_view()?.focus();
  }

  function submit_link() {
    const view = get_view();
    if (!view) return;
    apply_link(view, link_input_value);
    link_popover_open = false;
  }

  function remove_current_link() {
    const view = get_view();
    if (!view) return;
    remove_link(view);
    link_popover_open = false;
  }

  function handle_click(command: FormattingCommand) {
    const view = get_view();
    if (!view) return;
    if (command === "link") {
      if (link_popover_open) close_link_popover();
      else open_link_popover();
      return;
    }
    if (command === "image") {
      void on_image_pick?.();
      return;
    }
    view.focus();
    on_command(command);
  }
</script>

<div class="FormattingToolbar" role="toolbar" aria-label="Formatting">
  {#each groups as group}
    {#if group !== "history"}
      <div class="FormattingToolbar__separator"></div>
    {/if}
    {#each buttons.filter((b) => b.group === group) as button (button.id)}
      {@const _version = get_state_version()}
      {@const current_view = get_view()}
      {@const is_active = is_button_active(button)}
      {@const available = current_view
        ? is_command_available(button.id, current_view) &&
          (button.id !== "image" || !!on_image_pick)
        : false}
      {@const hint = shortcut_hint(button.id)}
      {@const label = hint ? `${button.label} (${hint})` : button.label}
      <button
        type="button"
        class="FormattingToolbar__button"
        class:FormattingToolbar__button--active={is_active}
        class:FormattingToolbar__button--disabled={!available}
        title={label}
        aria-label={label}
        aria-pressed={is_active}
        disabled={!available}
        onmousedown={(e) => {
          e.preventDefault();
          handle_click(button.id);
        }}
      >
        <button.icon />
      </button>
    {/each}
  {/each}

  {#if link_popover_open}
    <div
      class="FormattingToolbar__link-popover"
      role="dialog"
      aria-label="Edit link"
    >
      <input
        bind:this={link_input_el}
        bind:value={link_input_value}
        type="url"
        placeholder="https://example.com"
        class="FormattingToolbar__link-input"
        onmousedown={(e) => e.stopPropagation()}
        onkeydown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit_link();
          } else if (e.key === "Escape") {
            e.preventDefault();
            close_link_popover();
          }
        }}
      />
      <button
        type="button"
        class="FormattingToolbar__link-action"
        onmousedown={(e) => {
          e.preventDefault();
          submit_link();
        }}
      >
        Apply
      </button>
      {#if link_has_existing}
        <button
          type="button"
          class="FormattingToolbar__link-action FormattingToolbar__link-action--remove"
          onmousedown={(e) => {
            e.preventDefault();
            remove_current_link();
          }}
        >
          Remove
        </button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .FormattingToolbar {
    position: relative;
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 4px;
    background-color: var(--popover);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-md);
  }

  .FormattingToolbar__link-popover {
    position: absolute;
    top: calc(100% + 4px);
    left: 4px;
    z-index: 20;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px;
    background-color: var(--popover);
    color: var(--popover-foreground);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-md);
  }

  .FormattingToolbar__link-input {
    width: 240px;
    padding: 4px 8px;
    font-size: 0.875rem;
    color: var(--foreground);
    background-color: var(--background);
    border: 1px solid var(--input);
    border-radius: var(--radius-sm);
  }

  .FormattingToolbar__link-input:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 1px;
  }

  .FormattingToolbar__link-action {
    padding: 4px 10px;
    font-size: 0.875rem;
    color: var(--primary-foreground);
    background-color: var(--primary);
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
  }

  .FormattingToolbar__link-action--remove {
    color: var(--destructive-foreground);
    background-color: var(--destructive);
  }

  .FormattingToolbar__separator {
    width: 1px;
    height: 20px;
    background-color: var(--border);
    margin: 0 2px;
  }

  .FormattingToolbar__button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--muted-foreground);
    cursor: pointer;
    transition:
      background-color 100ms ease,
      color 100ms ease;
  }

  .FormattingToolbar__button:hover:not(:disabled) {
    background-color: var(--accent);
    color: var(--accent-foreground);
  }

  .FormattingToolbar__button--active {
    background-color: var(--accent);
    color: var(--accent-foreground);
  }

  .FormattingToolbar__button--disabled {
    opacity: 0.4;
    cursor: default;
    pointer-events: none;
  }

  .FormattingToolbar__button:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 1px;
  }

  .FormattingToolbar__button :global(svg) {
    width: 16px;
    height: 16px;
  }

  :global(.formatting-toolbar-mount--sticky) .FormattingToolbar {
    border-radius: 0;
    box-shadow: none;
    border-top: none;
    border-left: none;
    border-right: none;
    border-bottom: 1px solid var(--border);
    justify-content: center;
  }
</style>
