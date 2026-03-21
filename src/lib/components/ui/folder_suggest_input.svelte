<script lang="ts">
  type Props = {
    value: string;
    folder_paths: string[];
    on_change: (path: string) => void;
    disabled?: boolean;
    placeholder?: string;
  };

  let {
    value,
    folder_paths,
    on_change,
    disabled = false,
    placeholder = "Folder path...",
  }: Props = $props();

  let query = $state("");
  let show_dropdown = $state(false);
  let selected_index = $state(0);

  $effect(() => {
    query = value;
  });

  const filtered = $derived.by(() => {
    const q = query.toLowerCase().replace(/\/$/, "");
    const candidates = ["", ...folder_paths];
    if (q === "" || q === "/") return candidates.slice(0, 10);
    return candidates
      .filter((p) => p.toLowerCase().startsWith(q))
      .slice(0, 10);
  });

  function commit(path: string) {
    query = path;
    on_change(path);
    show_dropdown = false;
    selected_index = 0;
  }

  function longest_common_prefix(paths: string[]): string {
    if (paths.length === 0) return "";
    let prefix = paths[0] ?? "";
    for (let i = 1; i < paths.length; i++) {
      const p = paths[i] ?? "";
      let j = 0;
      while (j < prefix.length && j < p.length && prefix[j] === p[j]) j++;
      prefix = prefix.slice(0, j);
    }
    return prefix;
  }

  function on_keydown(e: KeyboardEvent) {
    if (!show_dropdown && e.key !== "Tab") return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      selected_index = Math.min(selected_index + 1, filtered.length - 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      selected_index = Math.max(selected_index - 1, 0);
    } else if (e.key === "Enter") {
      if (show_dropdown && filtered.length > 0) {
        e.preventDefault();
        commit(filtered[selected_index] ?? "");
      }
    } else if (e.key === "Tab" && !e.shiftKey) {
      if (filtered.length === 0) return;
      e.preventDefault();
      if (filtered.length === 1) {
        commit(filtered[0] ?? "");
        return;
      }
      const lc_paths = filtered.map((p) => p.toLowerCase());
      const prefix_lc = longest_common_prefix(lc_paths);
      const q_lc = query.toLowerCase().replace(/\/$/, "");
      if (prefix_lc.length > q_lc.length) {
        const completion = (filtered[0] ?? "").slice(0, prefix_lc.length);
        query = completion;
        show_dropdown = true;
        selected_index = 0;
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      show_dropdown = false;
    }
  }

  function on_input(e: Event) {
    query = (e.currentTarget as HTMLInputElement).value.replace(/\/$/, "");
    show_dropdown = true;
    selected_index = 0;
  }

  function on_focus() {
    show_dropdown = true;
  }

  function on_blur() {
    setTimeout(() => {
      show_dropdown = false;
    }, 150);
  }
</script>

<div class="FolderSuggest">
  <input
    class="FolderSuggest__input"
    type="text"
    value={query ? `${query}/` : ""}
    {placeholder}
    {disabled}
    oninput={on_input}
    onkeydown={on_keydown}
    onfocus={on_focus}
    onblur={on_blur}
  />
  {#if show_dropdown && filtered.length > 0}
    <div class="FolderSuggest__dropdown">
      {#each filtered as folder, i (folder)}
        <button
          class="FolderSuggest__item"
          class:FolderSuggest__item--selected={i === selected_index}
          type="button"
          onmousedown={(e) => {
            e.preventDefault();
            commit(folder);
          }}
        >
          {folder || "(vault root)"}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .FolderSuggest {
    position: relative;
    width: 100%;
  }

  .FolderSuggest__input {
    border: 1px solid var(--border);
    background: var(--background);
    color: var(--foreground);
    height: 2.25rem;
    width: 100%;
    min-width: 0;
    border-radius: calc(var(--radius) - 2px);
    padding: 0.25rem 0.75rem;
    font-size: 0.875rem;
    outline: none;
    transition:
      color 0.15s,
      box-shadow 0.15s;
    box-shadow: var(--shadow-xs, 0 1px 2px 0 rgb(0 0 0 / 0.05));
  }

  .FolderSuggest__input::placeholder {
    color: var(--muted-foreground);
  }

  .FolderSuggest__input:focus-visible {
    border-color: var(--ring);
    box-shadow:
      0 0 0 3px color-mix(in srgb, var(--ring) 50%, transparent),
      var(--shadow-xs, 0 1px 2px 0 rgb(0 0 0 / 0.05));
  }

  .FolderSuggest__input:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  .FolderSuggest__dropdown {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    right: 0;
    z-index: 50;
    background: var(--popover);
    color: var(--popover-foreground);
    border: 1px solid var(--border);
    border-radius: calc(var(--radius) - 2px);
    box-shadow:
      0 4px 6px -1px rgb(0 0 0 / 0.1),
      0 2px 4px -2px rgb(0 0 0 / 0.1);
    max-height: calc(10 * 2.25rem);
    overflow-y: auto;
    display: flex;
    flex-direction: column;
  }

  .FolderSuggest__item {
    all: unset;
    cursor: pointer;
    padding: 0.375rem 0.75rem;
    font-size: 0.875rem;
    line-height: 1.5rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    border-radius: 0;
  }

  .FolderSuggest__item:hover {
    background: var(--accent);
    color: var(--accent-foreground);
  }

  .FolderSuggest__item--selected {
    background: var(--accent);
    color: var(--accent-foreground);
  }
</style>
