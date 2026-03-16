<script lang="ts">
  import { SvelteSet } from "svelte/reactivity";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Input } from "$lib/components/ui/input";
  import SearchIcon from "@lucide/svelte/icons/search";
  import FileIcon from "@lucide/svelte/icons/file-text";
  import ClockIcon from "@lucide/svelte/icons/clock";
  import CommandIcon from "@lucide/svelte/icons/terminal";
  import SettingsIcon from "@lucide/svelte/icons/settings";
  import FilePlusIcon from "@lucide/svelte/icons/file-plus";
  import FolderOpenIcon from "@lucide/svelte/icons/folder-open";
  import LibraryIcon from "@lucide/svelte/icons/library";
  import GitBranchIcon from "@lucide/svelte/icons/git-branch";
  import HistoryIcon from "@lucide/svelte/icons/history";
  import BookmarkIcon from "@lucide/svelte/icons/bookmark";
  import KeyboardIcon from "@lucide/svelte/icons/keyboard";
  import LinkIcon from "@lucide/svelte/icons/link";
  import RefreshCwIcon from "@lucide/svelte/icons/refresh-cw";
  import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
  import type {
    OmnibarItem,
    OmnibarQueryTarget,
    OmnibarScope,
  } from "$lib/shared/types/search";
  import type { NoteMeta } from "$lib/shared/types/note";
  import type { CommandIcon as CommandIconType } from "$lib/features/search/types/command_palette";
  import { COMMANDS_REGISTRY } from "$lib/features/search/domain/search_commands";
  import { COMMAND_TO_ACTION_ID } from "$lib/features/search/application/omnibar_actions";
  import {
    parse_search_query,
    set_search_query_target,
  } from "$lib/features/search/domain/search_query_parser";
  import { HotkeyKey } from "$lib/features/hotkey";
  import type { HotkeyConfig } from "$lib/features/hotkey";
  import type { Component } from "svelte";

  const COMMAND_ICONS: Record<CommandIconType, Component> = {
    "file-plus": FilePlusIcon,
    "folder-open": FolderOpenIcon,
    settings: SettingsIcon,
    keyboard: KeyboardIcon,
    "git-branch": GitBranchIcon,
    history: HistoryIcon,
    bookmark: BookmarkIcon,
    link: LinkIcon,
    "refresh-cw": RefreshCwIcon,
  };

  const NOTE_FILTERS: Array<{
    label: string;
    target: OmnibarQueryTarget;
  }> = [
    { label: "All", target: "all" },
    { label: "Files", target: "files" },
    { label: "Content", target: "content" },
  ];

  type Props = {
    open: boolean;
    query: string;
    selected_index: number;
    is_searching: boolean;
    scope: OmnibarScope;
    items: OmnibarItem[];
    recent_notes: NoteMeta[];
    recent_command_ids: string[];
    hotkeys_config: HotkeyConfig;
    has_multiple_vaults: boolean;
    on_open_change: (open: boolean) => void;
    on_query_change: (query: string) => void;
    on_selected_index_change: (index: number) => void;
    on_scope_change: (scope: OmnibarScope) => void;
    on_confirm: (item: OmnibarItem) => void;
  };

  let {
    open,
    query,
    selected_index,
    is_searching,
    scope,
    items,
    recent_notes,
    recent_command_ids,
    hotkeys_config,
    has_multiple_vaults,
    on_open_change,
    on_query_change,
    on_selected_index_change,
    on_scope_change,
    on_confirm,
  }: Props = $props();

  let input_ref: HTMLInputElement | null = $state(null);
  let collapsed_vaults = $state(new SvelteSet<string>());
  let prev_items_ref: OmnibarItem[] = $state([]);
  let mouse_moved = $state(false);

  $effect(() => {
    if (open) {
      mouse_moved = false;
    }
  });

  const is_command_mode = $derived(query.startsWith(">"));
  const active_query = $derived.by(() => parse_search_query(query));
  const has_query = $derived(
    query.trim().length > 0 && (!is_command_mode || query.trim().length > 1),
  );
  const is_all_vaults = $derived(scope === "all_vaults");
  const show_scope_toggle = $derived(has_multiple_vaults && !is_command_mode);
  const show_note_filters = $derived(active_query.domain === "notes");

  type VaultGroup = {
    vault_name: string;
    vault_id: string;
    items: OmnibarItem[];
    vault_note_count: number | null;
    vault_last_opened_at: number | null;
    vault_is_available: boolean;
  };

  type NoteSearchItem =
    | Extract<OmnibarItem, { kind: "note" }>
    | Extract<OmnibarItem, { kind: "cross_vault_note" }>;

  function format_relative_time(timestamp_ms: number): string {
    const delta = Date.now() - timestamp_ms;
    const seconds = Math.floor(delta / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const months = Math.floor(days / 30);
    const years = Math.floor(days / 365);

    if (years > 0) return `${years}y ago`;
    if (months > 0) return `${months}mo ago`;
    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return "just now";
  }

  const vault_groups: VaultGroup[] = $derived.by(() => {
    if (!is_all_vaults || !has_query) return [];

    const groups = new Map<string, VaultGroup>();
    for (const item of items) {
      if (item.kind !== "cross_vault_note") continue;
      let group = groups.get(item.vault_id);
      if (!group) {
        group = {
          vault_name: item.vault_name,
          vault_id: item.vault_id,
          items: [],
          vault_note_count: item.vault_note_count ?? null,
          vault_last_opened_at: item.vault_last_opened_at ?? null,
          vault_is_available: item.vault_is_available !== false,
        };
        groups.set(item.vault_id, group);
      }
      group.items.push(item);
    }
    return Array.from(groups.values());
  });

  $effect(() => {
    if (!is_all_vaults || !has_query) return;
    if (items !== prev_items_ref && items.length > 0) {
      collapsed_vaults = new SvelteSet(vault_groups.map((g) => g.vault_id));
      prev_items_ref = items;
    }
  });

  const sorted_commands = $derived.by(() => {
    const mru_index = new Map(recent_command_ids.map((id, i) => [id, i]));
    return [...COMMANDS_REGISTRY].sort((a, b) => {
      const a_idx = mru_index.get(a.id);
      const b_idx = mru_index.get(b.id);
      if (a_idx !== undefined && b_idx !== undefined) return a_idx - b_idx;
      if (a_idx !== undefined) return -1;
      if (b_idx !== undefined) return 1;
      return 0;
    });
  });

  const display_items: OmnibarItem[] = $derived.by(() => {
    if (has_query) return items;

    if (is_command_mode) {
      return sorted_commands.map((command) => ({
        kind: "command" as const,
        command,
        score: 0,
      }));
    }

    if (is_all_vaults) return [];

    const recent: OmnibarItem[] = recent_notes.map((note) => ({
      kind: "recent_note" as const,
      note,
    }));
    const commands: OmnibarItem[] = sorted_commands.map((command) => ({
      kind: "command" as const,
      command,
      score: 0,
    }));
    return [...recent, ...commands];
  });

  type QuerySection = {
    id: string;
    label: string;
    items: NoteSearchItem[];
  };

  const query_sections: QuerySection[] = $derived.by(() => {
    if (!has_query || is_all_vaults || active_query.domain !== "notes") {
      return [];
    }

    const note_items = display_items.filter(
      (item): item is NoteSearchItem =>
        item.kind === "note" || item.kind === "cross_vault_note",
    );

    if (active_query.target === "all") {
      const file_items = note_items.filter(
        (item) => item.match_kind === "file",
      );
      const content_items = note_items.filter(
        (item) => item.match_kind !== "file",
      );
      const sections: QuerySection[] = [];
      if (file_items.length > 0) {
        sections.push({ id: "files", label: "Files", items: file_items });
      }
      if (content_items.length > 0) {
        sections.push({
          id: "content",
          label: "Content",
          items: content_items,
        });
      }
      return sections;
    }

    const label =
      active_query.target === "content"
        ? "Content"
        : active_query.target === "path"
          ? "Paths"
          : active_query.target === "title"
            ? "Titles"
            : "Files";
    return note_items.length > 0
      ? [{ id: active_query.target, label, items: note_items }]
      : [];
  });

  const visible_items: OmnibarItem[] = $derived.by(() => {
    if (!is_all_vaults || !has_query) return display_items;

    return display_items.filter((item) => {
      if (item.kind !== "cross_vault_note") return true;
      return !collapsed_vaults.has(item.vault_id);
    });
  });

  const action_id_to_key = $derived.by(() => {
    const map = new Map<string, string>();
    for (const b of hotkeys_config.bindings) {
      if (b.key !== null) map.set(b.action_id, b.key);
    }
    return map;
  });

  const show_recent_header = $derived(
    !has_query && !is_command_mode && !is_all_vaults && recent_notes.length > 0,
  );
  const show_commands_header = $derived(
    !has_query &&
      !is_command_mode &&
      !is_all_vaults &&
      COMMANDS_REGISTRY.length > 0,
  );
  const commands_start_index = $derived(
    !has_query && !is_command_mode && !is_all_vaults ? recent_notes.length : -1,
  );

  function get_item_id(item: OmnibarItem): string {
    switch (item.kind) {
      case "note":
        return `omni-note-${item.note.id}`;
      case "cross_vault_note":
        return `omni-xv-${item.vault_id}-${item.note.id}`;
      case "planned_note":
        return `omni-planned-${encodeURIComponent(item.target_path)}`;
      case "recent_note":
        return `omni-recent-${item.note.id}`;
      case "command":
        return `omni-cmd-${item.command.id}`;
      case "setting":
        return `omni-setting-${item.setting.key}`;
    }
  }

  function toggle_vault_group(vault_id: string) {
    if (collapsed_vaults.has(vault_id)) {
      collapsed_vaults.delete(vault_id);
    } else {
      collapsed_vaults.add(vault_id);
    }
    const clamped =
      visible_items.length > 0
        ? Math.min(selected_index, visible_items.length - 1)
        : 0;
    on_selected_index_change(clamped);
  }

  function cycle_note_filter(direction: 1 | -1) {
    const current_idx = NOTE_FILTERS.findIndex(
      (filter) => filter.target === active_query.target,
    );
    const normalized_index = current_idx >= 0 ? current_idx : 0;
    const next_idx =
      (normalized_index + direction + NOTE_FILTERS.length) %
      NOTE_FILTERS.length;
    const next_filter = NOTE_FILTERS[next_idx];
    if (!next_filter) return;
    apply_note_filter(next_filter.target);
  }

  function apply_note_filter(target: OmnibarQueryTarget) {
    on_query_change(set_search_query_target(query, target));
    setTimeout(() => input_ref?.focus(), 0);
  }

  function match_badge_label(item: OmnibarItem): string | null {
    if (item.kind !== "note" && item.kind !== "cross_vault_note") {
      return null;
    }

    switch (item.match_detail) {
      case "filename":
        return "Filename";
      case "title":
        return "Title";
      case "path":
        return "Path";
      case "content":
        return "Content";
      default:
        return item.match_kind === "file" ? "File" : null;
    }
  }

  function handle_keydown(event: KeyboardEvent) {
    if (!open) return;

    if (event.key === "Tab" && show_note_filters) {
      event.preventDefault();
      event.stopPropagation();
      cycle_note_filter(event.shiftKey ? -1 : 1);
      return;
    }

    switch (event.key) {
      case "Escape":
        event.preventDefault();
        on_open_change(false);
        break;
      case "ArrowDown":
        event.preventDefault();
        if (visible_items.length > 0) {
          on_selected_index_change((selected_index + 1) % visible_items.length);
        }
        break;
      case "ArrowUp":
        event.preventDefault();
        if (visible_items.length > 0) {
          on_selected_index_change(
            (selected_index - 1 + visible_items.length) % visible_items.length,
          );
        }
        break;
      case "Enter":
        event.preventDefault();
        if (visible_items[selected_index]) {
          on_confirm(visible_items[selected_index]);
        }
        break;
    }
  }

  $effect(() => {
    if (!open) return;
    const ref = input_ref;
    if (!ref) return;
    setTimeout(() => {
      ref.focus();
    }, 0);
  });
</script>

<Dialog.Root {open} onOpenChange={on_open_change}>
  <Dialog.Content class="Omnibar" showCloseButton={false}>
    <div class="Omnibar__search">
      <SearchIcon />
      <Input
        bind:ref={input_ref}
        type="text"
        placeholder={is_all_vaults
          ? "Search every vault by file, path, or content"
          : "Search notes, files, paths, or type > for commands"}
        value={query}
        oninput={(e: Event & { currentTarget: HTMLInputElement }) => {
          on_query_change(e.currentTarget.value);
        }}
        class="border-0 bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
      />
      {#if is_searching}
        <div class="Omnibar__spinner"></div>
      {/if}
    </div>

    {#if show_scope_toggle || show_note_filters}
      <div class="Omnibar__toolbar">
        {#if show_scope_toggle}
          <div class="Omnibar__scope">
            <button
              class="Omnibar__scope-btn"
              class:Omnibar__scope-btn--active={!is_all_vaults}
              onclick={() => on_scope_change("current_vault")}
            >
              Current Vault
            </button>
            <button
              class="Omnibar__scope-btn"
              class:Omnibar__scope-btn--active={is_all_vaults}
              onclick={() => on_scope_change("all_vaults")}
            >
              <LibraryIcon />
              All Vaults
            </button>
            <span class="Omnibar__toolbar-hint"
              ><kbd>{is_all_vaults ? "⌘O" : "⌘⇧F"}</kbd></span
            >
          </div>
        {/if}

        {#if show_note_filters}
          <div class="Omnibar__filter-strip">
            {#each NOTE_FILTERS as filter}
              <button
                class="Omnibar__filter-btn"
                class:Omnibar__filter-btn--active={active_query.target ===
                  filter.target}
                onclick={() => apply_note_filter(filter.target)}
              >
                {filter.label}
              </button>
            {/each}
            <span class="Omnibar__toolbar-hint"><kbd>Tab</kbd></span>
          </div>
        {/if}
      </div>
    {/if}

    <div
      role="listbox"
      tabindex="0"
      aria-activedescendant={visible_items[selected_index]
        ? get_item_id(visible_items[selected_index])
        : undefined}
      class="Omnibar__list"
      onmousemove={() => {
        mouse_moved = true;
      }}
    >
      {#if is_all_vaults && has_query}
        {#if vault_groups.length > 0}
          {#each vault_groups as group, group_idx}
            {@const is_collapsed = collapsed_vaults.has(group.vault_id)}
            <button
              class="Omnibar__vault-facet"
              class:Omnibar__vault-facet--bordered={group_idx > 0}
              class:Omnibar__vault-facet--unavailable={!group.vault_is_available}
              onclick={() => toggle_vault_group(group.vault_id)}
              aria-expanded={!is_collapsed}
            >
              <div class="Omnibar__vault-facet-header">
                <span
                  class="Omnibar__vault-facet-chevron"
                  class:Omnibar__vault-facet-chevron--open={!is_collapsed}
                >
                  <ChevronRightIcon />
                </span>
                <LibraryIcon />
                <span class="Omnibar__vault-facet-name">{group.vault_name}</span
                >
                {#if !group.vault_is_available}
                  <span class="Omnibar__vault-facet-unavailable"
                    >Unavailable</span
                  >
                {/if}
                <span class="Omnibar__vault-facet-count"
                  >{group.items.length}</span
                >
              </div>
              <div class="Omnibar__vault-facet-meta">
                <span class="Omnibar__vault-facet-chip"
                  >{group.vault_note_count != null
                    ? `${group.vault_note_count} notes`
                    : "-- notes"}</span
                >
                <span class="Omnibar__vault-facet-sep">·</span>
                <span class="Omnibar__vault-facet-chip"
                  >{group.vault_last_opened_at != null
                    ? `Opened ${format_relative_time(group.vault_last_opened_at)}`
                    : "Opened --"}</span
                >
              </div>
            </button>
            {#if !is_collapsed}
              {#each group.items as item (get_item_id(item))}
                {@const vis_index = visible_items.indexOf(item)}
                <button
                  id={get_item_id(item)}
                  role="option"
                  aria-selected={vis_index === selected_index}
                  class="Omnibar__item"
                  class:Omnibar__item--selected={vis_index === selected_index}
                  onmouseenter={() => {
                    if (!mouse_moved) return;
                    on_selected_index_change(vis_index);
                  }}
                  onclick={() => {
                    on_confirm(item);
                  }}
                >
                  {#if item.kind === "cross_vault_note"}
                    <div class="Omnibar__item-row">
                      <FileIcon />
                      <div class="Omnibar__item-content">
                        <span class="Omnibar__item-title"
                          >{item.note.title}</span
                        >
                        <span class="Omnibar__item-path">{item.note.path}</span>
                        {#if item.snippet && item.match_kind !== "file"}
                          <span class="Omnibar__item-snippet"
                            >{item.snippet}</span
                          >
                        {/if}
                      </div>
                      <div class="Omnibar__item-meta">
                        {#if match_badge_label(item)}
                          <span class="Omnibar__badge"
                            >{match_badge_label(item)}</span
                          >
                        {/if}
                        <span class="Omnibar__vault-badge"
                          >{item.vault_name}</span
                        >
                      </div>
                    </div>
                  {/if}
                </button>
              {/each}
            {/if}
          {/each}
        {:else if !is_searching}
          <div class="Omnibar__empty">No results across vaults</div>
        {/if}
      {:else if query_sections.length > 0}
        {#each query_sections as section, section_index}
          <div
            class="Omnibar__header"
            class:Omnibar__header--bordered={section_index > 0}
          >
            <FileIcon />
            <span>{section.label}</span>
          </div>

          {#each section.items as item (get_item_id(item))}
            {@const section_item_index = display_items.indexOf(item)}
            <button
              id={get_item_id(item)}
              role="option"
              aria-selected={section_item_index === selected_index}
              class="Omnibar__item"
              class:Omnibar__item--selected={section_item_index ===
                selected_index}
              class:Omnibar__item--file={item.match_kind === "file"}
              onmouseenter={() => {
                if (!mouse_moved) return;
                on_selected_index_change(section_item_index);
              }}
              onclick={() => {
                on_confirm(item);
              }}
            >
              {#if item.kind === "note"}
                <div class="Omnibar__item-row">
                  <FileIcon />
                  <div class="Omnibar__item-content">
                    <span class="Omnibar__item-title">{item.note.title}</span>
                    <span class="Omnibar__item-path">{item.note.path}</span>
                    {#if item.snippet && item.match_kind !== "file"}
                      <span class="Omnibar__item-snippet">{item.snippet}</span>
                    {/if}
                  </div>
                  {#if match_badge_label(item)}
                    <span class="Omnibar__badge">{match_badge_label(item)}</span
                    >
                  {/if}
                </div>
              {/if}
            </button>
          {/each}
        {/each}
      {:else}
        {#if show_recent_header && recent_notes.length > 0}
          <div class="Omnibar__header">
            <ClockIcon />
            <span>Recent</span>
          </div>
        {/if}

        {#if show_commands_header && commands_start_index === 0}
          <div class="Omnibar__header">
            <CommandIcon />
            <span>Commands</span>
          </div>
        {/if}

        {#each display_items as item, index (get_item_id(item))}
          {#if show_commands_header && index === commands_start_index && commands_start_index > 0}
            <div class="Omnibar__header Omnibar__header--bordered">
              <CommandIcon />
              <span>Commands</span>
            </div>
          {/if}

          <button
            id={get_item_id(item)}
            role="option"
            aria-selected={index === selected_index}
            class="Omnibar__item"
            class:Omnibar__item--selected={index === selected_index}
            onmouseenter={() => {
              if (!mouse_moved) return;
              on_selected_index_change(index);
            }}
            onclick={() => {
              on_confirm(item);
            }}
          >
            {#if item.kind === "note"}
              <div class="Omnibar__item-row">
                <FileIcon />
                <div class="Omnibar__item-content">
                  <span class="Omnibar__item-title">{item.note.title}</span>
                  <span class="Omnibar__item-path">{item.note.path}</span>
                  {#if item.snippet}
                    <span class="Omnibar__item-snippet">{item.snippet}</span>
                  {/if}
                </div>
                {#if match_badge_label(item)}
                  <span class="Omnibar__badge">{match_badge_label(item)}</span>
                {/if}
              </div>
            {:else if item.kind === "recent_note"}
              <div class="Omnibar__item-row">
                <ClockIcon />
                <div class="Omnibar__item-content">
                  <span class="Omnibar__item-title">{item.note.name}</span>
                  <span class="Omnibar__item-path">{item.note.path}</span>
                </div>
              </div>
            {:else if item.kind === "command"}
              {@const IconComponent = COMMAND_ICONS[item.command.icon]}
              {@const command_key = action_id_to_key.get(
                COMMAND_TO_ACTION_ID[item.command.id],
              )}
              <div class="Omnibar__item-row">
                <span class="Omnibar__item-icon"><IconComponent /></span>
                <span class="Omnibar__item-title">{item.command.label}</span>
                {#if command_key}
                  <span class="Omnibar__item-shortcut"
                    ><HotkeyKey hotkey={command_key} /></span
                  >
                {/if}
              </div>
              <div class="Omnibar__item-desc">{item.command.description}</div>
            {:else if item.kind === "setting"}
              <div class="Omnibar__item-row">
                <SettingsIcon />
                <span class="Omnibar__item-title">{item.setting.label}</span>
                <span class="Omnibar__badge">{item.setting.category}</span>
              </div>
              <div class="Omnibar__item-desc">{item.setting.description}</div>
            {:else if item.kind === "planned_note"}
              <div class="Omnibar__item-row">
                <LinkIcon />
                <div class="Omnibar__item-content">
                  <span class="Omnibar__item-title">{item.target_path}</span>
                  <span class="Omnibar__item-path">{item.ref_count} refs</span>
                </div>
                <span class="Omnibar__badge">Planned</span>
              </div>
            {/if}
          </button>
        {/each}

        {#if display_items.length === 0}
          <div class="Omnibar__empty">
            {#if has_query}
              No results found
            {:else}
              No recent notes
            {/if}
          </div>
        {/if}
      {/if}

      {#if is_all_vaults && !has_query && !is_searching}
        <div class="Omnibar__empty">Type to search across all vaults</div>
      {/if}
    </div>

    <div class="Omnibar__footer">
      {#if is_all_vaults}
        <span class="Omnibar__hint"><kbd>↵</kbd> to open vault</span>
        <span class="Omnibar__hint-sep">·</span>
        <span class="Omnibar__hint"><kbd>⌘O</kbd> current vault</span>
      {:else}
        <span class="Omnibar__hint"><kbd>&gt;</kbd> for commands</span>
        <span class="Omnibar__hint-sep">·</span>
        <span class="Omnibar__hint"><kbd>Tab</kbd> cycles filters</span>
        <span class="Omnibar__hint-sep">·</span>
        <span class="Omnibar__hint"><kbd>⌘⇧F</kbd> all vaults</span>
      {/if}
    </div>
  </Dialog.Content>
</Dialog.Root>

<svelte:window onkeydown={handle_keydown} />

<style>
  :global(.Omnibar) {
    max-width: var(--size-dialog-xl);
    padding: 0 !important;
    overflow: hidden;
    gap: var(--space-2);
  }

  .Omnibar__search {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding-inline: var(--space-3);
    border-bottom: 1px solid var(--border);
  }

  :global(.Omnibar__search svg) {
    width: var(--size-icon);
    height: var(--size-icon);
    flex-shrink: 0;
    color: var(--muted-foreground);
  }

  .Omnibar__spinner {
    width: var(--size-icon);
    height: var(--size-icon);
    border: 2px solid var(--muted-foreground);
    border-top-color: transparent;
    border-radius: 50%;
    flex-shrink: 0;
    animation: spin 1s linear infinite;
  }

  .Omnibar__filter-strip {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    margin-left: auto;
  }

  .Omnibar__filter-btn {
    display: inline-flex;
    align-items: center;
    padding: var(--space-1) var(--space-2);
    font-size: var(--text-xs);
    font-weight: 500;
    border-radius: var(--radius-sm);
    color: var(--muted-foreground);
    transition:
      background-color var(--duration-fast) var(--ease-default),
      color var(--duration-fast) var(--ease-default);
  }

  .Omnibar__filter-btn:hover {
    background-color: var(--muted);
    color: var(--foreground);
  }

  .Omnibar__filter-btn--active {
    background-color: var(--interactive-bg);
    color: var(--interactive);
  }

  .Omnibar__scope {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }

  .Omnibar__scope-btn {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-1) var(--space-2);
    font-size: var(--text-xs);
    font-weight: 500;
    border-radius: var(--radius-sm);
    color: var(--muted-foreground);
    transition:
      background-color var(--duration-fast) var(--ease-default),
      color var(--duration-fast) var(--ease-default);
  }

  .Omnibar__scope-btn:hover {
    background-color: var(--muted);
    color: var(--foreground);
  }

  .Omnibar__scope-btn--active {
    background-color: var(--interactive-bg);
    color: var(--interactive);
  }

  .Omnibar__scope-btn--active:hover {
    background-color: var(--interactive-bg-hover);
  }

  :global(.Omnibar__scope-btn svg) {
    width: var(--size-icon-xs);
    height: var(--size-icon-xs);
  }

  .Omnibar__toolbar {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding-inline: var(--space-3);
    padding-bottom: var(--space-2);
    border-bottom: 1px solid var(--border);
  }

  .Omnibar__toolbar-hint {
    font-size: var(--text-xs);
    color: var(--muted-foreground);
  }

  .Omnibar__toolbar-hint kbd {
    font-family: inherit;
    font-size: var(--text-xs);
    padding: var(--space-0-5) var(--space-1);
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
    background-color: var(--muted);
    color: var(--foreground);
  }

  .Omnibar__list {
    height: var(--size-dialog-list-height-lg);
    overflow-y: auto;
    padding-block: var(--space-2);
  }

  .Omnibar__header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-1-5) var(--space-3);
    font-size: var(--text-xs);
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--muted-foreground);
  }

  .Omnibar__header--bordered {
    margin-top: var(--space-2);
    padding-top: var(--space-2);
    border-top: 1px solid var(--border);
  }

  :global(.Omnibar__header svg) {
    width: var(--size-icon-xs);
    height: var(--size-icon-xs);
  }

  .Omnibar__vault-facet {
    display: flex;
    flex-direction: column;
    gap: var(--space-0-5);
    width: 100%;
    padding: var(--space-1-5) var(--space-3);
    text-align: left;
    cursor: pointer;
    transition: background-color var(--duration-fast) var(--ease-default);
  }

  .Omnibar__vault-facet:hover {
    background-color: var(--muted);
  }

  .Omnibar__vault-facet--bordered {
    margin-top: var(--space-2);
    padding-top: var(--space-2);
    border-top: 1px solid var(--border);
  }

  .Omnibar__vault-facet--unavailable {
    opacity: 0.6;
  }

  .Omnibar__vault-facet-header {
    display: flex;
    align-items: center;
    gap: var(--space-1-5);
    font-size: var(--text-xs);
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--interactive);
  }

  .Omnibar__vault-facet--unavailable .Omnibar__vault-facet-header {
    color: var(--muted-foreground);
  }

  :global(.Omnibar__vault-facet-header svg) {
    width: var(--size-icon-xs);
    height: var(--size-icon-xs);
    flex-shrink: 0;
  }

  .Omnibar__vault-facet-chevron {
    display: flex;
    align-items: center;
    transition: transform var(--duration-fast) var(--ease-default);
    transform: rotate(0deg);
  }

  .Omnibar__vault-facet-chevron--open {
    transform: rotate(90deg);
  }

  :global(.Omnibar__vault-facet-chevron svg) {
    width: var(--size-icon-xs);
    height: var(--size-icon-xs);
  }

  .Omnibar__vault-facet-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .Omnibar__vault-facet-count {
    flex-shrink: 0;
    font-size: var(--text-xs);
    font-weight: 500;
    padding: var(--space-0-5) var(--space-1-5);
    border-radius: var(--radius-sm);
    background-color: var(--interactive-bg);
    color: var(--interactive);
    text-transform: none;
    letter-spacing: normal;
  }

  .Omnibar__vault-facet--unavailable .Omnibar__vault-facet-count {
    background-color: var(--muted);
    color: var(--muted-foreground);
  }

  .Omnibar__vault-facet-unavailable {
    flex-shrink: 0;
    font-size: var(--text-xs);
    font-weight: 500;
    padding: var(--space-0-5) var(--space-1-5);
    border-radius: var(--radius-sm);
    background-color: var(--destructive);
    color: var(--destructive-foreground);
    text-transform: none;
    letter-spacing: normal;
  }

  .Omnibar__vault-facet-meta {
    display: flex;
    align-items: center;
    gap: var(--space-1-5);
    padding-left: calc(
      var(--size-icon-xs) + var(--size-icon-xs) + var(--space-1-5) * 2
    );
  }

  .Omnibar__vault-facet-chip {
    font-size: var(--text-xs);
    color: var(--muted-foreground);
    letter-spacing: normal;
    text-transform: none;
    font-weight: 400;
  }

  .Omnibar__vault-facet-sep {
    font-size: var(--text-xs);
    color: var(--muted-foreground);
  }

  .Omnibar__vault-badge {
    flex-shrink: 0;
    font-size: var(--text-xs);
    padding: var(--space-0-5) var(--space-1-5);
    border-radius: var(--radius-sm);
    background-color: var(--interactive-bg);
    color: var(--interactive);
    font-weight: 500;
  }

  .Omnibar__item-meta {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    margin-left: auto;
    flex-shrink: 0;
  }

  .Omnibar__item--selected .Omnibar__vault-badge {
    background-color: var(--interactive-bg-hover);
  }

  .Omnibar__item {
    display: flex;
    flex-direction: column;
    gap: var(--space-0-5);
    width: 100%;
    padding: var(--space-2) var(--space-3);
    text-align: left;
    border-radius: 0;
    transition: background-color var(--duration-fast) var(--ease-default);
  }

  .Omnibar__item:focus {
    outline: none;
  }

  .Omnibar__item--selected {
    background-color: var(--interactive-bg);
  }

  .Omnibar__item--selected .Omnibar__item-title {
    color: var(--interactive);
  }

  .Omnibar__item-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .Omnibar__item-shortcut {
    margin-left: auto;
    flex-shrink: 0;
  }

  :global(.Omnibar__item-row svg) {
    width: var(--size-icon);
    height: var(--size-icon);
    flex-shrink: 0;
    color: var(--muted-foreground);
  }

  .Omnibar__item--selected :global(.Omnibar__item-row svg) {
    color: var(--interactive);
  }

  .Omnibar__item-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--muted-foreground);
    transition: color var(--duration-fast) var(--ease-default);
  }

  :global(.Omnibar__item-icon svg) {
    width: var(--size-icon-sm);
    height: var(--size-icon-sm);
  }

  .Omnibar__item--selected .Omnibar__item-icon {
    color: var(--interactive);
  }

  .Omnibar__item-content {
    display: flex;
    flex-direction: column;
    min-width: 0;
    flex: 1;
  }

  .Omnibar__item-title {
    font-weight: 500;
    color: var(--foreground);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .Omnibar__item-path,
  .Omnibar__item-snippet {
    font-size: var(--text-xs);
    color: var(--muted-foreground);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .Omnibar__item-desc {
    font-size: var(--text-sm);
    color: var(--muted-foreground);
  }

  .Omnibar__badge {
    font-size: var(--text-xs);
    padding: var(--space-0-5) var(--space-1-5);
    border-radius: var(--radius-sm);
    background-color: var(--muted);
    color: var(--muted-foreground);
  }

  .Omnibar__empty {
    padding: var(--space-8) var(--space-3);
    text-align: center;
    font-size: var(--text-sm);
    color: var(--muted-foreground);
  }

  .Omnibar__footer {
    display: flex;
    align-items: center;
    gap: var(--space-1-5);
    padding: var(--space-1-5) var(--space-3);
    border-top: 1px solid var(--border);
    font-size: var(--text-xs);
    color: var(--muted-foreground);
  }

  .Omnibar__hint kbd {
    font-family: inherit;
    font-size: var(--text-xs);
    padding: 0;
    color: var(--foreground);
  }

  .Omnibar__hint-sep {
    color: var(--muted-foreground);
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
</style>
