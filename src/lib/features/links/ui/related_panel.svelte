<script lang="ts">
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
  import SuggestedLinksSection from "$lib/features/links/ui/suggested_links_section.svelte";
  import FileText from "@lucide/svelte/icons/file-text";
  import Hash from "@lucide/svelte/icons/hash";
  import History from "@lucide/svelte/icons/history";
  import Folder from "@lucide/svelte/icons/folder";
  import Link2Off from "@lucide/svelte/icons/link-2-off";

  const { stores, action_registry } = use_app_context();

  const open_note_path = $derived(stores.editor.open_note?.meta.path ?? "");

  const current_folder = $derived.by(() => {
    if (!open_note_path) return "";
    const idx = open_note_path.lastIndexOf("/");
    return idx >= 0 ? open_note_path.slice(0, idx) : "";
  });

  function folder_of(path: string): string {
    const idx = path.lastIndexOf("/");
    return idx >= 0 ? path.slice(0, idx) : "";
  }

  const shared_tag_notes = $derived(stores.links.related_shared_tag);
  const unlinked_mentions = $derived(stores.links.related_unlinked);

  const siblings = $derived.by(() => {
    if (!open_note_path) return [];
    return stores.notes.notes
      .filter(
        (n) =>
          n.path !== open_note_path && folder_of(n.path) === current_folder,
      )
      .slice(0, 30);
  });

  const recent_in_folder = $derived.by(() => {
    if (!open_note_path) return [];
    return stores.notes.recent_notes
      .filter(
        (n) =>
          n.path !== open_note_path && folder_of(n.path) === current_folder,
      )
      .slice(0, 8);
  });

  function open_note(path: string) {
    void action_registry.execute(ACTION_IDS.note_open, path);
  }
</script>

<div class="RelatedPanel">
  {#if !open_note_path}
    <p class="RelatedPanel__empty">Open a note to see related context.</p>
  {:else}
    <SuggestedLinksSection title="Similar notes" />

    {#if shared_tag_notes.length > 0}
      <section class="RelatedPanel__section">
        <header class="RelatedPanel__heading">
          <Hash size={12} />
          <span>Shared tags</span>
        </header>
        <ul class="RelatedPanel__list">
          {#each shared_tag_notes as note (note.path)}
            <li>
              <button
                type="button"
                class="RelatedPanel__row"
                onclick={() => open_note(note.path)}
              >
                <FileText size={12} />
                <span class="truncate">{note.title || note.name}</span>
              </button>
            </li>
          {/each}
        </ul>
      </section>
    {/if}

    {#if unlinked_mentions.length > 0}
      <section class="RelatedPanel__section">
        <header class="RelatedPanel__heading">
          <Link2Off size={12} />
          <span>Unlinked mentions</span>
        </header>
        <ul class="RelatedPanel__list">
          {#each unlinked_mentions as note (note.path)}
            <li>
              <button
                type="button"
                class="RelatedPanel__row"
                onclick={() => open_note(note.path)}
              >
                <FileText size={12} />
                <span class="truncate">{note.title || note.name}</span>
              </button>
            </li>
          {/each}
        </ul>
      </section>
    {/if}

    <section class="RelatedPanel__section">
      <header class="RelatedPanel__heading">
        <Folder size={12} />
        <span>Siblings in {current_folder || "/"}</span>
      </header>
      {#if siblings.length === 0}
        <p class="RelatedPanel__hint">No other notes in this folder.</p>
      {:else}
        <ul class="RelatedPanel__list">
          {#each siblings as note (note.path)}
            <li>
              <button
                type="button"
                class="RelatedPanel__row"
                onclick={() => open_note(note.path)}
              >
                <FileText size={12} />
                <span class="truncate">{note.title || note.name}</span>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    {#if recent_in_folder.length > 0}
      <section class="RelatedPanel__section">
        <header class="RelatedPanel__heading">
          <History size={12} />
          <span>Recently edited</span>
        </header>
        <ul class="RelatedPanel__list">
          {#each recent_in_folder as note (note.path)}
            <li>
              <button
                type="button"
                class="RelatedPanel__row"
                onclick={() => open_note(note.path)}
              >
                <FileText size={12} />
                <span class="truncate">{note.title || note.name}</span>
              </button>
            </li>
          {/each}
        </ul>
      </section>
    {/if}
  {/if}
</div>

<style>
  .RelatedPanel {
    height: 100%;
    overflow-y: auto;
    padding: 0.75rem 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .RelatedPanel__empty {
    color: var(--muted-foreground);
    font-size: 0.75rem;
    padding: 1rem 0.5rem;
    text-align: center;
  }
  .RelatedPanel__section {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .RelatedPanel__heading {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.625rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--muted-foreground);
    padding: 0 0.5rem;
  }
  .RelatedPanel__hint {
    color: var(--muted-foreground);
    font-size: 0.75rem;
    padding: 0.25rem 0.5rem;
  }
  .RelatedPanel__list {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .RelatedPanel__row {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.25rem 0.5rem;
    font-size: 0.75rem;
    text-align: left;
    border-radius: 0.25rem;
    background: transparent;
    color: var(--foreground);
    border: 0;
    cursor: pointer;
  }
  .RelatedPanel__row:hover {
    background: var(--muted);
  }
</style>
