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
    is_command_available,
  } from "../adapters/formatting_toolbar_commands";

  interface Props {
    get_view: () => EditorView | null;
    get_state_version: () => number;
    on_command: (command: FormattingCommand) => void;
  }

  let { get_view, get_state_version, on_command }: Props = $props();

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

  function handle_click(command: FormattingCommand) {
    const view = get_view();
    if (!view) return;
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
      {@const is_active = button.mark_name
        ? active_marks.has(button.mark_name)
        : false}
      {@const current_view = get_view()}
      {@const _version = get_state_version()}
      {@const available = current_view ? is_command_available(button.id, current_view) : false}
      <button
        type="button"
        class="FormattingToolbar__button"
        class:FormattingToolbar__button--active={is_active}
        class:FormattingToolbar__button--disabled={!available}
        title={button.label}
        aria-label={button.label}
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
</div>

<style>
  .FormattingToolbar {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 4px;
    background-color: var(--popover);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-md);
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
