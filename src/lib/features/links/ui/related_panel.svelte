<script lang="ts">
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
  import FileText from "@lucide/svelte/icons/file-text";
  import Hash from "@lucide/svelte/icons/hash";
  import History from "@lucide/svelte/icons/history";
  import Folder from "@lucide/svelte/icons/folder";

  const { stores, action_registry } = use_app_context();

  const open_note_path = $derived(stores.editor.open_note?.meta.path ?? "");

  const current_folder = $derived.by(() => {
    if (!open_note_path) return "";
    const idx = open_note_path.lastIndexOf("/");
    return idx >= 0 ? open_note_path.slice(0, idx) : "";
  });

  const siblings = $derived.by(() => {
    if (!open_note_path) return [];
    return stores.notes.notes
      .filter((n) => {
        if (n.path === open_note_path) return false;
        const idx = n.path.lastIndexOf("/");
        const folder = idx >= 0 ? n.path.slice(0, idx) : "";
        return folder === current_folder;
      })
      .slice(0, 30);
  });

  const recent_in_folder = $derived.by(() => {
    if (!open_note_path) return [];
    return stores.notes.recent_notes
      .filter((n) => {
        if (n.path === open_note_path) return false;
        const idx = n.path.lastIndexOf("/");
        const folder = idx >= 0 ? n.path.slice(0, idx) : "";
        return folder === current_folder;
      })
      .slice(0, 8);
  });

  const tag_chips = $derived(
    stores.metadata.tags.map((t) => t.tag).slice(0, 20),
  );

  function open_note(path: string) {
    void action_registry.execute(ACTION_IDS.note_open, path);
  }

  function open_tag_query(tag: string) {
    stores.bases.query = {
      ...stores.bases.query,
      filters: [{ property: "tag", operator: "eq", value: tag }],
      offset: 0,
    };
    stores.bases.active_view_name = `Tag: ${tag}`;
    stores.ui.set_sidebar_view("bases");
    const vault_id = stores.vault.active_vault_id;
    if (vault_id) {
      void action_registry.execute(ACTION_IDS.bases_refresh);
    }
  }
</script>

<div class="RelatedPanel">
  {#if !open_note_path}
    <p class="RelatedPanel__empty">Open a note to see related context.</p>
  {:else}
    {#if recent_in_folder.length > 0}
      <section class="RelatedPanel__section">
        <header class="RelatedPanel__heading">
          <History size={12} />
          <span>Recent in folder</span>
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

    {#if tag_chips.length > 0}
      <section class="RelatedPanel__section">
        <header class="RelatedPanel__heading">
          <Hash size={12} />
          <span>Shared tags</span>
        </header>
        <div class="RelatedPanel__chips">
          {#each tag_chips as tag (tag)}
            <button
              type="button"
              class="RelatedPanel__chip"
              onclick={() => open_tag_query(tag)}
            >
              #{tag}
            </button>
          {/each}
        </div>
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
  .RelatedPanel__chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    padding: 0 0.5rem;
  }
  .RelatedPanel__chip {
    font-size: 0.625rem;
    padding: 0.125rem 0.375rem;
    border-radius: 9999px;
    background: var(--muted);
    color: var(--foreground);
    border: 0;
    cursor: pointer;
  }
  .RelatedPanel__chip:hover {
    background: var(--accent);
  }
</style>
