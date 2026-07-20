<script lang="ts">
  import { ChevronRight } from "@lucide/svelte";

  interface Props {
    note_path: string | null;
    note_title: string | null;
    vault_name: string | null;
    on_select_folder: (folder_path: string) => void;
    on_reveal_note: (note_path: string) => void;
  }

  let {
    note_path,
    note_title,
    vault_name,
    on_select_folder,
    on_reveal_note,
  }: Props = $props();

  type Segment = {
    key: string;
    label: string;
    kind: "root" | "folder" | "note";
    target: string;
  };

  const segments = $derived.by<Segment[]>(() => {
    const path = (note_path ?? "").trim();
    if (!path) return [];

    const parts = path.split("/").filter(Boolean);
    if (parts.length === 0) return [];

    const result: Segment[] = [
      {
        key: "__root__",
        label: vault_name?.trim() || "Vault",
        kind: "root",
        target: "",
      },
    ];

    for (let i = 0; i < parts.length - 1; i += 1) {
      const folder_path = parts.slice(0, i + 1).join("/");
      result.push({
        key: `folder:${folder_path}`,
        label: parts[i] ?? folder_path,
        kind: "folder",
        target: folder_path,
      });
    }

    const file_name = parts[parts.length - 1] ?? "";
    const stripped = file_name.replace(/\.md$/i, "");
    result.push({
      key: `note:${path}`,
      label: note_title?.trim() || stripped || file_name,
      kind: "note",
      target: path,
    });

    return result;
  });

  function handle_click(segment: Segment) {
    if (segment.kind === "note") {
      on_reveal_note(segment.target);
    } else {
      on_select_folder(segment.target);
    }
  }
</script>

{#if segments.length > 0}
  <nav class="Breadcrumb" aria-label="Note location">
    <ol class="Breadcrumb__list">
      {#each segments as segment, i (segment.key)}
        {#if i > 0}
          <li class="Breadcrumb__sep" aria-hidden="true">
            <ChevronRight />
          </li>
        {/if}
        <li
          class="Breadcrumb__item"
          class:Breadcrumb__item--current={segment.kind === "note"}
        >
          <button
            type="button"
            class="Breadcrumb__segment"
            class:Breadcrumb__segment--root={segment.kind === "root"}
            class:Breadcrumb__segment--current={segment.kind === "note"}
            onclick={() => handle_click(segment)}
            aria-current={segment.kind === "note" ? "page" : undefined}
            title={segment.kind === "note"
              ? "Reveal in file tree"
              : `Open ${segment.label || "root"}`}
          >
            {segment.label}
          </button>
        </li>
      {/each}
    </ol>
  </nav>
{/if}

<style>
  .Breadcrumb {
    display: flex;
    align-items: center;
    min-height: var(--size-touch-xs);
    padding-inline: var(--space-3);
    padding-block: var(--space-1);
    font-size: var(--text-xs);
    color: var(--muted-foreground);
    border-bottom: 1px solid var(--border-subtle, var(--border));
    background-color: var(--background);
    flex-shrink: 0;
    overflow: hidden;
  }

  .Breadcrumb__list {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    margin: 0;
    padding: 0;
    list-style: none;
    flex-wrap: nowrap;
    min-width: 0;
    overflow: hidden;
  }

  .Breadcrumb__item {
    display: inline-flex;
    align-items: center;
    min-width: 0;
  }

  .Breadcrumb__item--current {
    flex-shrink: 1;
    min-width: 0;
  }

  .Breadcrumb__sep {
    display: inline-flex;
    align-items: center;
    opacity: 0.5;
    flex-shrink: 0;
  }

  .Breadcrumb__segment {
    appearance: none;
    background: none;
    border: none;
    padding: 0 var(--space-1);
    color: inherit;
    font: inherit;
    line-height: 1;
    border-radius: var(--radius-sm);
    max-width: 16rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    transition:
      color var(--duration-fast) var(--ease-default),
      background-color var(--duration-fast) var(--ease-default);
  }

  .Breadcrumb__segment:hover:not(:disabled) {
    color: var(--foreground);
    background-color: var(--accent);
  }

  .Breadcrumb__segment:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 1px;
  }

  .Breadcrumb__segment--current {
    color: var(--foreground);
    font-weight: var(--font-weight-medium, 500);
  }

  :global(.Breadcrumb__sep svg) {
    width: var(--size-icon-xs);
    height: var(--size-icon-xs);
  }
</style>
