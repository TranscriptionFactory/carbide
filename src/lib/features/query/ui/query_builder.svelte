<script lang="ts">
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import FolderSuggestInput from "$lib/components/ui/folder_suggest_input.svelte";
  import {
    build_query_text,
    type PropertyOperator,
    type QueryBuilderClause,
    type QueryBuilderClauseEntry,
    type QueryBuilderSpec,
  } from "../domain/query_builder";
  import type { JoinOp, QueryForm } from "../types";
  import { PROPERTY_OPERATORS } from "../domain/query_parser";

  type Props = {
    on_insert: (text: string) => void;
  };

  let { on_insert }: Props = $props();

  const { stores } = use_app_context();

  const forms: QueryForm[] = ["notes", "folders", "files"];
  const clause_kinds: QueryBuilderClause["kind"][] = [
    "named",
    "tag",
    "folder",
    "linked_from",
    "property",
  ];
  const operators = PROPERTY_OPERATORS as readonly PropertyOperator[];

  const tag_options = $derived(stores.tag.tags.map((t) => t.tag));
  const folder_paths = $derived(stores.notes.folder_paths);

  let form = $state<QueryForm>("notes");
  let clauses = $state<QueryBuilderClauseEntry[]>([
    { clause: { kind: "named", name: "" } },
  ]);

  function default_clause(
    kind: QueryBuilderClause["kind"],
  ): QueryBuilderClause {
    switch (kind) {
      case "named":
        return { kind: "named", name: "" };
      case "tag":
        return { kind: "tag", tag: "" };
      case "folder":
        return { kind: "folder", folder: "" };
      case "linked_from":
        return { kind: "linked_from", note: "" };
      case "property":
        return { kind: "property", property: "", operator: "=", value: "" };
    }
  }

  function change_kind(index: number, kind: QueryBuilderClause["kind"]) {
    const entry = clauses[index];
    if (!entry) return;
    entry.clause = default_clause(kind);
  }

  function add_clause() {
    clauses.push({ connective: "and", clause: default_clause("named") });
  }

  function remove_clause(index: number) {
    clauses.splice(index, 1);
  }

  function clause_valid(clause: QueryBuilderClause): boolean {
    switch (clause.kind) {
      case "named":
        return clause.name.trim().length > 0;
      case "tag":
        return clause.tag.trim().length > 0;
      case "folder":
        return clause.folder.trim().length > 0;
      case "linked_from":
        return clause.note.trim().length > 0;
      case "property":
        return (
          clause.property.trim().length > 0 && clause.value.trim().length > 0
        );
    }
  }

  const spec = $derived<QueryBuilderSpec>({ form, clauses });
  const valid = $derived(
    clauses.length > 0 && clauses.every((e) => clause_valid(e.clause)),
  );

  function insert() {
    if (!valid) return;
    on_insert(build_query_text(spec));
  }
</script>

<div class="QueryBuilder">
  <div class="QueryBuilder__body">
    <label class="QueryBuilder__form">
      <span>Form</span>
      <select bind:value={form} class="QueryBuilder__select">
        {#each forms as f (f)}
          <option value={f}>{f}</option>
        {/each}
      </select>
    </label>

    {#each clauses as entry, i (i)}
      <div class="QueryBuilder__row">
        {#if i > 0}
          <select
            bind:value={entry.connective}
            class="QueryBuilder__select QueryBuilder__connective"
          >
            {#each ["and", "or"] as const as op (op)}
              <option value={op}>{op}</option>
            {/each}
          </select>
        {/if}

        <label class="QueryBuilder__negate">
          <input type="checkbox" bind:checked={entry.clause.negated} />
          not
        </label>

        <select
          class="QueryBuilder__select"
          value={entry.clause.kind}
          onchange={(e) =>
            change_kind(i, e.currentTarget.value as QueryBuilderClause["kind"])}
        >
          {#each clause_kinds as kind (kind)}
            <option value={kind}>{kind}</option>
          {/each}
        </select>

        {#if entry.clause.kind === "named"}
          <input
            class="QueryBuilder__input"
            type="text"
            placeholder="name"
            bind:value={entry.clause.name}
          />
        {:else if entry.clause.kind === "tag"}
          <select bind:value={entry.clause.tag} class="QueryBuilder__select">
            <option value="" disabled>Select tag…</option>
            {#each tag_options as tag (tag)}
              <option value={tag}>{tag}</option>
            {/each}
          </select>
        {:else if entry.clause.kind === "folder"}
          <div class="QueryBuilder__grow">
            <FolderSuggestInput
              value={entry.clause.folder}
              {folder_paths}
              on_change={(path) => {
                if (entry.clause.kind === "folder") entry.clause.folder = path;
              }}
            />
          </div>
        {:else if entry.clause.kind === "linked_from"}
          <input
            class="QueryBuilder__input"
            type="text"
            placeholder="note name"
            bind:value={entry.clause.note}
          />
        {:else if entry.clause.kind === "property"}
          <input
            class="QueryBuilder__input QueryBuilder__prop"
            type="text"
            placeholder="property"
            bind:value={entry.clause.property}
          />
          <select
            bind:value={entry.clause.operator}
            class="QueryBuilder__select"
          >
            {#each operators as op (op)}
              <option value={op}>{op}</option>
            {/each}
          </select>
          <input
            class="QueryBuilder__input"
            type="text"
            placeholder="value"
            bind:value={entry.clause.value}
          />
        {/if}

        <button
          type="button"
          class="QueryBuilder__remove"
          onclick={() => remove_clause(i)}
          disabled={clauses.length === 1}
          title="Remove clause"
        >
          ×
        </button>
      </div>
    {/each}

    <div class="QueryBuilder__actions">
      <button type="button" class="QueryBuilder__add" onclick={add_clause}>
        + clause
      </button>
      <button
        type="button"
        class="QueryBuilder__insert"
        onclick={insert}
        disabled={!valid}
      >
        Insert
      </button>
    </div>
  </div>
</div>

<style>
  .QueryBuilder {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    flex-shrink: 0;
  }

  .QueryBuilder__body {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding: var(--space-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background-color: var(--muted);
  }

  .QueryBuilder__form {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    font-size: var(--text-xs);
    color: var(--muted-foreground);
  }

  .QueryBuilder__row {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    flex-wrap: wrap;
  }

  .QueryBuilder__select,
  .QueryBuilder__input {
    padding: var(--space-1) var(--space-2);
    font-size: var(--text-sm);
    background-color: var(--input);
    color: var(--foreground);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    outline: none;
  }

  .QueryBuilder__select:focus,
  .QueryBuilder__input:focus {
    border-color: var(--ring);
  }

  .QueryBuilder__input {
    flex: 1;
    min-width: 6rem;
  }

  .QueryBuilder__prop {
    flex: 0 1 8rem;
  }

  .QueryBuilder__grow {
    flex: 1;
    min-width: 8rem;
  }

  .QueryBuilder__connective {
    text-transform: lowercase;
  }

  .QueryBuilder__negate {
    display: flex;
    align-items: center;
    gap: 2px;
    font-size: var(--text-xs);
    color: var(--muted-foreground);
  }

  .QueryBuilder__remove {
    padding: 0 var(--space-2);
    font-size: var(--text-sm);
    color: var(--muted-foreground);
    border-radius: var(--radius-sm);
  }

  .QueryBuilder__remove:hover:not(:disabled) {
    color: var(--destructive);
  }

  .QueryBuilder__remove:disabled {
    opacity: 0.4;
  }

  .QueryBuilder__actions {
    display: flex;
    gap: var(--space-1);
  }

  .QueryBuilder__add {
    padding: var(--space-1) var(--space-2);
    font-size: var(--text-sm);
    background-color: var(--secondary);
    color: var(--secondary-foreground);
    border-radius: var(--radius-sm);
  }

  .QueryBuilder__insert {
    padding: var(--space-1) var(--space-3);
    font-size: var(--text-sm);
    background-color: var(--primary);
    color: var(--primary-foreground);
    border-radius: var(--radius-sm);
  }

  .QueryBuilder__insert:disabled {
    opacity: 0.5;
  }
</style>
