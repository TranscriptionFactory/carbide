<script lang="ts">
  import { untrack } from "svelte";
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import {
    build_task_query_text,
    type DueClause,
    type TaskQueryBuilderSpec,
    type TaskQueryClause,
    type TaskSortSpec,
  } from "../domain/task_query_builder";
  import type { TaskGrouping, TaskStatus } from "../types";

  type Props = {
    on_insert: (text: string) => void;
    collapsed?: boolean;
  };

  let { on_insert, collapsed = false }: Props = $props();

  const { stores } = use_app_context();

  const clause_kinds: TaskQueryClause["kind"][] = [
    "status",
    "due",
    "tag",
    "path",
    "text",
    "section",
  ];
  const statuses: TaskStatus[] = ["todo", "doing", "done"];
  const due_kinds: DueClause["kind"][] = [
    "today",
    "this_week",
    "last_week",
    "next_days",
    "before",
    "after",
    "on",
  ];
  const sort_props = ["status", "text", "path", "due_date", "section"];
  const group_props: TaskGrouping[] = [
    "none",
    "note",
    "section",
    "due_date",
    "status",
  ];

  const tag_options = $derived(stores.tag.tags.map((t) => t.tag));

  let open = $state(untrack(() => !collapsed));
  let clauses = $state<TaskQueryClause[]>([{ kind: "status", status: "todo" }]);
  let sort = $state<TaskSortSpec[]>([]);
  let group_by = $state<TaskGrouping>("none");

  function default_clause(kind: TaskQueryClause["kind"]): TaskQueryClause {
    switch (kind) {
      case "status":
        return { kind: "status", status: "todo" };
      case "due":
        return { kind: "due", due: { kind: "today" } };
      case "tag":
        return { kind: "tag", tag: "" };
      case "path":
        return { kind: "path", text: "" };
      case "text":
        return { kind: "text", text: "" };
      case "section":
        return { kind: "section", match: "under", heading: "" };
    }
  }

  function default_due(kind: DueClause["kind"]): DueClause {
    switch (kind) {
      case "next_days":
        return { kind: "next_days", days: 7 };
      case "before":
      case "after":
      case "on":
        return { kind, date: "" };
      default:
        return { kind };
    }
  }

  function change_kind(index: number, kind: TaskQueryClause["kind"]) {
    clauses[index] = default_clause(kind);
  }

  function change_due(index: number, kind: DueClause["kind"]) {
    const clause = clauses[index];
    if (clause?.kind !== "due") return;
    clause.due = default_due(kind);
  }

  function add_clause() {
    clauses.push(default_clause("status"));
  }

  function remove_clause(index: number) {
    clauses.splice(index, 1);
  }

  function add_sort() {
    sort.push({ property: "due_date", descending: false });
  }

  function remove_sort(index: number) {
    sort.splice(index, 1);
  }

  function clause_valid(clause: TaskQueryClause): boolean {
    switch (clause.kind) {
      case "status":
        return true;
      case "due":
        return due_valid(clause.due);
      case "tag":
        return clause.tag.trim().length > 0;
      case "path":
      case "text":
        return clause.text.trim().length > 0;
      case "section":
        return clause.heading.trim().length > 0;
    }
  }

  function due_valid(due: DueClause): boolean {
    if (due.kind === "before" || due.kind === "after" || due.kind === "on") {
      return /^\d{4}-\d{2}-\d{2}$/.test(due.date);
    }
    if (due.kind === "next_days") return due.days > 0;
    return true;
  }

  const spec = $derived<TaskQueryBuilderSpec>({ clauses, sort, group_by });
  const valid = $derived(clauses.length > 0 && clauses.every(clause_valid));

  function insert() {
    if (!valid) return;
    on_insert(build_task_query_text(spec));
  }
</script>

<div class="TaskQueryBuilder">
  <button
    type="button"
    class="TaskQueryBuilder__toggle"
    onclick={() => (open = !open)}
  >
    {open ? "▾" : "▸"} Builder
  </button>

  {#if open}
    <div class="TaskQueryBuilder__body">
      {#each clauses as clause, i (i)}
        <div class="TaskQueryBuilder__row">
          <select
            class="TaskQueryBuilder__select"
            value={clause.kind}
            onchange={(e) =>
              change_kind(i, e.currentTarget.value as TaskQueryClause["kind"])}
          >
            {#each clause_kinds as kind (kind)}
              <option value={kind}>{kind}</option>
            {/each}
          </select>

          {#if clause.kind === "status"}
            <select bind:value={clause.status} class="TaskQueryBuilder__select">
              {#each statuses as s (s)}
                <option value={s}>{s}</option>
              {/each}
            </select>
          {:else if clause.kind === "due"}
            <select
              class="TaskQueryBuilder__select"
              value={clause.due.kind}
              onchange={(e) =>
                change_due(i, e.currentTarget.value as DueClause["kind"])}
            >
              {#each due_kinds as k (k)}
                <option value={k}>{k.replace("_", " ")}</option>
              {/each}
            </select>
            {#if clause.due.kind === "next_days"}
              <input
                class="TaskQueryBuilder__input TaskQueryBuilder__days"
                type="number"
                min="1"
                bind:value={clause.due.days}
              />
            {:else if clause.due.kind === "before" || clause.due.kind === "after" || clause.due.kind === "on"}
              <input
                class="TaskQueryBuilder__input"
                type="date"
                bind:value={clause.due.date}
              />
            {/if}
          {:else if clause.kind === "tag"}
            <select bind:value={clause.tag} class="TaskQueryBuilder__select">
              <option value="" disabled>Select tag…</option>
              {#each tag_options as tag (tag)}
                <option value={tag}>{tag}</option>
              {/each}
            </select>
          {:else if clause.kind === "path"}
            <input
              class="TaskQueryBuilder__input"
              type="text"
              placeholder="path includes…"
              bind:value={clause.text}
            />
          {:else if clause.kind === "text"}
            <input
              class="TaskQueryBuilder__input"
              type="text"
              placeholder="text includes…"
              bind:value={clause.text}
            />
          {:else if clause.kind === "section"}
            <select bind:value={clause.match} class="TaskQueryBuilder__select">
              {#each ["is", "under"] as const as m (m)}
                <option value={m}>{m}</option>
              {/each}
            </select>
            <input
              class="TaskQueryBuilder__input"
              type="text"
              placeholder="heading"
              bind:value={clause.heading}
            />
            {#if clause.match === "under"}
              <label class="TaskQueryBuilder__check">
                <input
                  type="checkbox"
                  checked={clause.include_subheadings !== false}
                  onchange={(e) => {
                    if (clause.kind === "section")
                      clause.include_subheadings = e.currentTarget.checked;
                  }}
                />
                subheadings
              </label>
            {/if}
          {/if}

          <button
            type="button"
            class="TaskQueryBuilder__remove"
            onclick={() => remove_clause(i)}
            disabled={clauses.length === 1}
            title="Remove clause"
          >
            ×
          </button>
        </div>
      {/each}

      {#each sort as row, i (i)}
        <div class="TaskQueryBuilder__row">
          <span class="TaskQueryBuilder__label">sort by</span>
          <select bind:value={row.property} class="TaskQueryBuilder__select">
            {#each sort_props as p (p)}
              <option value={p}>{p}</option>
            {/each}
          </select>
          <label class="TaskQueryBuilder__check">
            <input type="checkbox" bind:checked={row.descending} />
            desc
          </label>
          <button
            type="button"
            class="TaskQueryBuilder__remove"
            onclick={() => remove_sort(i)}
            title="Remove sort"
          >
            ×
          </button>
        </div>
      {/each}

      <label class="TaskQueryBuilder__group">
        <span>Group by</span>
        <select bind:value={group_by} class="TaskQueryBuilder__select">
          {#each group_props as p (p)}
            <option value={p}>{p}</option>
          {/each}
        </select>
      </label>

      <div class="TaskQueryBuilder__actions">
        <button
          type="button"
          class="TaskQueryBuilder__add"
          onclick={add_clause}
        >
          + clause
        </button>
        <button type="button" class="TaskQueryBuilder__add" onclick={add_sort}>
          + sort
        </button>
        <button
          type="button"
          class="TaskQueryBuilder__insert"
          onclick={insert}
          disabled={!valid}
        >
          Insert
        </button>
      </div>
    </div>
  {/if}
</div>

<style>
  .TaskQueryBuilder {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    flex-shrink: 0;
  }

  .TaskQueryBuilder__toggle {
    align-self: flex-start;
    font-size: var(--text-xs);
    color: var(--muted-foreground);
    padding: var(--space-0-5) var(--space-1);
    border-radius: var(--radius-sm);
  }

  .TaskQueryBuilder__toggle:hover {
    background-color: var(--accent);
    color: var(--accent-foreground);
  }

  .TaskQueryBuilder__body {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding: var(--space-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background-color: var(--muted);
  }

  .TaskQueryBuilder__row {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    flex-wrap: wrap;
  }

  .TaskQueryBuilder__select,
  .TaskQueryBuilder__input {
    padding: var(--space-1) var(--space-2);
    font-size: var(--text-sm);
    background-color: var(--input);
    color: var(--foreground);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    outline: none;
  }

  .TaskQueryBuilder__select:focus,
  .TaskQueryBuilder__input:focus {
    border-color: var(--ring);
  }

  .TaskQueryBuilder__input {
    flex: 1;
    min-width: 6rem;
  }

  .TaskQueryBuilder__days {
    flex: 0 0 4rem;
    min-width: 0;
  }

  .TaskQueryBuilder__label,
  .TaskQueryBuilder__check {
    display: flex;
    align-items: center;
    gap: 2px;
    font-size: var(--text-xs);
    color: var(--muted-foreground);
  }

  .TaskQueryBuilder__group {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    font-size: var(--text-xs);
    color: var(--muted-foreground);
  }

  .TaskQueryBuilder__remove {
    padding: 0 var(--space-2);
    font-size: var(--text-sm);
    color: var(--muted-foreground);
    border-radius: var(--radius-sm);
  }

  .TaskQueryBuilder__remove:hover:not(:disabled) {
    color: var(--destructive);
  }

  .TaskQueryBuilder__remove:disabled {
    opacity: 0.4;
  }

  .TaskQueryBuilder__actions {
    display: flex;
    gap: var(--space-1);
  }

  .TaskQueryBuilder__add {
    padding: var(--space-1) var(--space-2);
    font-size: var(--text-sm);
    background-color: var(--secondary);
    color: var(--secondary-foreground);
    border-radius: var(--radius-sm);
  }

  .TaskQueryBuilder__insert {
    padding: var(--space-1) var(--space-3);
    font-size: var(--text-sm);
    background-color: var(--primary);
    color: var(--primary-foreground);
    border-radius: var(--radius-sm);
  }

  .TaskQueryBuilder__insert:disabled {
    opacity: 0.5;
  }
</style>
