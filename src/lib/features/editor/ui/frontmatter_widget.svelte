<script lang="ts">
  import { type EditorView } from "@milkdown/kit/prose/view";
  import { type Node as ProseNode } from "@milkdown/kit/prose/model";
  import Plus from "@lucide/svelte/icons/plus";
  import X from "@lucide/svelte/icons/x";
  import Tag from "@lucide/svelte/icons/tag";
  import GripVertical from "@lucide/svelte/icons/grip-vertical";
  import yaml from "js-yaml";

  let {
    node,
    view,
    get_pos,
  }: {
    node: ProseNode;
    view: EditorView;
    get_pos: () => number | undefined;
  } = $props();

  function update_node(new_content: string) {
    const pos = get_pos();
    if (pos === undefined) return;

    // We replace the entire content of the YAML node
    // In Milkdown, the YAML node content is the raw text between --- fences
    const tr = view.state.tr.insertText(
      new_content,
      pos + 1,
      pos + 1 + node.content.size,
    );
    view.dispatch(tr);
  }

  let properties = $state<{ key: string; value: any }[]>([]);
  let tags = $state<string[]>([]);
  let parse_error = $state<string | null>(null);

  $effect(() => {
    const content = node.textContent;
    try {
      const parsed = yaml.load(content) as any;
      if (parsed && typeof parsed === "object") {
        const new_props: { key: string; value: any }[] = [];
        const new_tags: string[] = [];

        for (const [key, value] of Object.entries(parsed)) {
          if (key === "tags" || key === "tag") {
            if (Array.isArray(value)) {
              new_tags.push(...value.map(String));
            } else if (value) {
              new_tags.push(String(value));
            }
          } else {
            new_props.push({ key, value });
          }
        }
        properties = new_props;
        tags = new_tags;
        parse_error = null;
      }
    } catch (e: any) {
      parse_error = e.message;
    }
  });

  function save() {
    const obj: any = {};
    for (const prop of properties) {
      if (prop.key) {
        obj[prop.key] = prop.value;
      }
    }
    if (tags.length > 0) {
      obj.tags = tags;
    }

    try {
      const new_yaml = yaml.dump(obj, { quotingType: '"', forceQuotes: false });
      update_node(new_yaml);
    } catch (e: any) {
      parse_error = "Failed to save: " + e.message;
    }
  }

  function add_property() {
    properties.push({ key: "", value: "" });
  }

  function remove_property(index: number) {
    properties.splice(index, 1);
    save();
  }

  function add_tag() {
    const tag = prompt("Enter tag name:");
    if (tag) {
      tags.push(tag);
      save();
    }
  }

  function remove_tag(index: number) {
    tags.splice(index, 1);
    save();
  }

  function handle_prop_change() {
    save();
  }
</script>

<div
  class="frontmatter-widget p-4 mb-4 border border-zinc-200 dark:border-zinc-800 rounded-lg bg-zinc-50 dark:bg-zinc-900/50 group/fm"
>
  <div class="flex items-center justify-between mb-4">
    <h3
      class="text-[10px] font-bold uppercase tracking-widest text-zinc-400 flex items-center gap-2"
    >
      <Tag size={12} />
      Properties
    </h3>
    {#if parse_error}
      <span class="text-[10px] text-red-500 font-medium"
        >YAML Error: {parse_error}</span
      >
    {/if}
  </div>

  <div class="space-y-2">
    {#each properties as prop, i}
      <div class="flex items-center gap-2 group/row">
        <div
          class="text-zinc-300 dark:text-zinc-700 opacity-0 group-hover/row:opacity-100 transition-opacity"
        >
          <GripVertical size={14} />
        </div>
        <input
          type="text"
          bind:value={prop.key}
          onblur={handle_prop_change}
          placeholder="Property"
          class="flex-1 bg-transparent border-none px-1 py-0.5 text-sm font-medium text-zinc-600 dark:text-zinc-400 focus:ring-0 focus:outline-none placeholder:text-zinc-300 dark:placeholder:text-zinc-700"
        />
        <div class="w-px h-4 bg-zinc-200 dark:bg-zinc-800"></div>
        <input
          type="text"
          bind:value={prop.value}
          onblur={handle_prop_change}
          placeholder="Value"
          class="flex-[2] bg-transparent border-none px-1 py-0.5 text-sm text-zinc-900 dark:text-zinc-100 focus:ring-0 focus:outline-none placeholder:text-zinc-300 dark:placeholder:text-zinc-700"
        />
        <button
          onclick={() => remove_property(i)}
          class="p-1 text-zinc-300 hover:text-red-500 opacity-0 group-hover/row:opacity-100 transition-opacity"
        >
          <X size={14} />
        </button>
      </div>
    {/each}

    {#if tags.length > 0 || properties.length === 0}
      <div class="flex flex-wrap gap-1.5 pt-2">
        {#each tags as tag, i}
          <span
            class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-200 dark:bg-zinc-800 text-[11px] font-medium text-zinc-700 dark:text-zinc-300"
          >
            {tag}
            <button
              onclick={() => remove_tag(i)}
              class="hover:text-red-500 transition-colors"
            >
              <X size={10} />
            </button>
          </span>
        {/each}
        <button
          onclick={add_tag}
          class="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-dashed border-zinc-300 dark:border-zinc-700 text-[11px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:border-zinc-400 dark:hover:border-zinc-500 transition-all"
        >
          <Plus size={10} />
          Add tag
        </button>
      </div>
    {/if}

    <button
      onclick={add_property}
      class="text-[11px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 flex items-center gap-1 pt-2 transition-colors"
    >
      <Plus size={12} />
      Add property
    </button>
  </div>
</div>

<style>
  .frontmatter-widget {
    user-select: none;
    margin-top: 1rem;
    margin-bottom: 2rem;
  }
  input {
    user-select: text;
  }
</style>
