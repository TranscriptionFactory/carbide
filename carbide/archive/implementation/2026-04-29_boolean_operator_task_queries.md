# Boolean Operators for Task Queries

## **Status**: IMPLEMENTED
## Context

Task queries currently AND all filter lines together. A query like:
```
not done
section includes urgent
section includes reminders
```
generates `WHERE status != 'done' AND section LIKE '%urgent%' AND section LIKE '%reminders%'`, which returns nothing since no section heading contains both words. Users need OR to express "tasks in section urgent OR reminders". This matches Obsidian Tasks' approach of parenthesized inline boolean operators.

## Syntax

Inline boolean operators within a single line, parenthesized:

```
(section includes urgent) OR (section includes reminders)
NOT (status is done)
(due before 2026-05-01) AND (path includes projects)
```

- Multiple lines remain implicitly ANDed (backward compatible)
- Precedence: NOT > AND > OR (standard boolean)
- Parentheses required for grouping operands
- Simple clauses (no operators) work unchanged

## Changes

### 1. TS types (`src/lib/features/task/types.ts`)

Add `FilterExpr` discriminated union. Change `TaskQuery.filters` → `TaskQuery.filter`:

```typescript
export type FilterExpr =
  | { type: "atom"; filter: TaskFilter }
  | { type: "and"; operands: FilterExpr[] }
  | { type: "or"; operands: FilterExpr[] }
  | { type: "not"; operand: FilterExpr };

export interface TaskQuery {
  filter: FilterExpr | null;  // was: filters: TaskFilter[]
  sort: TaskSort[];
  limit: number;
  offset: number;
}
```

`TaskFilter` stays unchanged.

### 2. Rust types (`src-tauri/src/features/tasks/types.rs`)

Add matching enum:

```rust
#[derive(Debug, Serialize, Deserialize, Clone, Type)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum FilterExpr {
    Atom { filter: TaskFilter },
    And { operands: Vec<FilterExpr> },
    Or { operands: Vec<FilterExpr> },
    Not { operand: Box<FilterExpr> },
}
```

Update `TaskQuery`:
```rust
pub struct TaskQuery {
    pub filter: Option<FilterExpr>,  // was: filters: Vec<TaskFilter>
    pub sort: Vec<TaskSort>,
    ...
}
```

Risk: specta 2.0.0-rc.22 may struggle with recursive `Box<FilterExpr>`. If so, skip specta derive on `FilterExpr` and keep hand-written TS type. Verify by running `cargo test` (specta export test).

### 3. TS parser (`src/lib/features/task/parse_task_query.ts`)

Extend `parse_line` to handle boolean expressions. Algorithm:

1. If line contains top-level `OR` (outside parens) → split, parse each side, return `{ type: "or" }`
2. If line contains top-level `AND` (outside parens) → split, parse each side, return `{ type: "and" }`
3. If line starts with `NOT (...)` → strip, parse inner, return `{ type: "not" }`
4. If line is wrapped in `(...)` → strip outer parens, recurse
5. Otherwise → existing atom parsing, wrap in `{ type: "atom" }`

Helper: `split_at_top_level(line, keyword)` — scan chars tracking paren depth, split only at depth 0.

`parse_task_query` collects `FilterExpr[]` from filter lines:
- 0 filters → `filter: null`
- 1 filter → `filter: <that expr>`
- 2+ filters → `filter: { type: "and", operands: [...] }`

Return type change: `query.filter: FilterExpr | null` instead of `query.filters: TaskFilter[]`.

### 4. Rust SQL builder (`src-tauri/src/features/tasks/service.rs`)

Replace `apply_task_filter` + flat loop with recursive `build_filter_sql`:

```rust
fn build_filter_sql(expr: &FilterExpr, params: &mut Vec<Box<dyn ToSql>>) -> Option<String> {
    match expr {
        FilterExpr::Atom { filter } => build_atom_sql(filter, params),
        FilterExpr::And { operands } => {
            let parts: Vec<_> = operands.iter().filter_map(|e| build_filter_sql(e, params)).collect();
            if parts.is_empty() { None } else { Some(format!("({})", parts.join(" AND "))) }
        }
        FilterExpr::Or { operands } => { /* same with " OR " */ }
        FilterExpr::Not { operand } => {
            build_filter_sql(operand, params).map(|s| format!("NOT ({})", s))
        }
    }
}
```

`build_atom_sql` is the existing `apply_task_filter` logic returning `Option<String>`.

In `query_tasks`: replace filter loop with single `build_filter_sql` call.

### 5. Callers to update

| File | Change |
|------|--------|
| `task_store.svelte.ts` | Keep `filter: TaskFilter[]` internally — the store is UI state for the panel |
| `task_service.ts` `build_query()` | Wrap `this.store.filter` array → `FilterExpr::And` before sending |
| `task_tauri_adapter.ts` | No change (passes `TaskQuery` through) |
| `code_block_view_plugin.ts` | No change (calls `parse_task_query` which returns new shape) |
| `cli_routes.rs` `TasksQueryParams` | Add `filter: Option<FilterExpr>` alongside existing `filters: Vec<TaskFilter>`. Resolve: prefer `filter`, fall back to wrapping `filters` in `And`. Backward compatible. |
| `src-tauri/src/features/tasks/mod.rs` | No change (takes `TaskQuery` directly) |

### 6. Tests

**Parser tests** (`tests/unit/domain/parse_task_query.test.ts`):
- Update existing tests: `query.filters` → `query.filter` assertions
- Add: `(section includes X) OR (section includes Y)` → or-expr
- Add: `(status is todo) AND (due before date)` → and-expr
- Add: `NOT (status is done)` → not-expr
- Add: mixed multi-line (boolean line + simple line) → top-level and
- Add: nested `((a) AND (b)) OR (c)` → proper nesting
- Add: error cases — unmatched parens, dangling operator

**Task service test** (`tests/unit/services/task_service.test.ts`):
- Update `build_query` assertion to expect `filter: FilterExpr` shape

**Task store test** (`tests/unit/stores/task_store.test.ts`):
- No change (store keeps `TaskFilter[]` internally)

**Rust tests** (`src-tauri/src/features/tasks/service.rs`):
- Add `build_filter_sql` unit tests: atom, and, or, not, nested

### 7. Docs update (`docs/search_and_queries.md`)

Add to Task Queries section:
- Boolean operators `AND`, `OR`, `NOT` within a single line
- Parenthesized syntax: `(clause) OR (clause)`
- Multiple lines are implicitly ANDed
- Precedence: NOT > AND > OR
- Examples showing common patterns

## Implementation Order

1. Types (TS + Rust) — `pnpm check` + `cargo check`
2. Parser (TS) — `pnpm test`
3. SQL builder (Rust) — `cargo check` + `cargo test`
4. Callers (store/service wrapper, CLI compat) — `pnpm check` + `cargo check`
5. Tests — `pnpm test` + `cargo test`
6. Docs
7. Full verification: `pnpm check && pnpm lint && pnpm test && cd src-tauri && cargo check`

## Files to modify

- `src/lib/features/task/types.ts`
- `src/lib/features/task/parse_task_query.ts`
- `src/lib/features/task/application/task_service.ts`
- `src/lib/features/task/index.ts` (export `FilterExpr`)
- `src-tauri/src/features/tasks/types.rs`
- `src-tauri/src/features/tasks/service.rs`
- `src-tauri/src/features/mcp/cli_routes.rs`
- `tests/unit/domain/parse_task_query.test.ts`
- `tests/unit/services/task_service.test.ts`
- `docs/search_and_queries.md`
