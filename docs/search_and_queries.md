# Search & Queries

Carbide provides several surfaces for finding and filtering information. All share the same underlying index (SQLite FTS5 + HNSW vector index) but expose different interaction paradigms.

**Note on query systems**: The query language, Bases, and task queries are three independent systems. They don't share parsers, syntax, or types. The query language is a clause-based syntax for filtering _notes_ by content, metadata, and links. Bases is a UI-driven filter builder for browsing vault frontmatter as a database. Task queries are a line-based DSL for filtering _tasks_ (extracted `[ ]` items) by status, dates, and text. Each targets a different domain, even though all ultimately read from the same SQLite index.

## Omnibar

**Shortcut**: `Cmd+K` / `Ctrl+K`

The omnibar is the unified entry point for search, commands, and navigation. It routes input based on what you type:

- **Plain text** → hybrid search (FTS + semantic, merged via Reciprocal Rank Fusion)
- **Structured syntax** → detected automatically when input contains clause keywords (`with`, `named`, `in`, `linked from`) or value syntax (`#tag`, `/regex/`, `[[wikilink]]`), then parsed and evaluated via the query engine
- **`?` prefix** → forwards the query to the dedicated query panel and executes it there (e.g. `?notes with #project`). Use this when you want richer result views (list, cards, feed) or to save the query for reuse. Inline structured queries show results in the omnibar dropdown; `?` opens the full panel instead
- **Commands** → matched against the action registry
- **Settings** → matched against available settings
- **Wiki links** → suggests existing and planned link targets

Cross-vault search is supported — results aggregate across all open vaults.

**Shortcut**: `Cmd+O` / `Ctrl+O` opens the omnibar in note-search mode directly.

## Query Language

A composable query syntax for structured note filtering. Queries can be typed in the omnibar, written in dedicated `.query` files, or built in the query panel.

### Forms

Queries target one of three forms:

| Form      | Matches        |
| --------- | -------------- |
| `notes`   | Markdown notes |
| `folders` | Directories    |
| `files`   | All files      |

Default is `notes` if omitted.

### Clauses

| Clause          | Description                    | Example                          |
| --------------- | ------------------------------ | -------------------------------- |
| `named`         | Title match (text or regex)    | `named /machine learning/`       |
| `with`          | Content or tag match           | `with #rust`                     |
| `in`            | Folder path                    | `in "Projects"`                  |
| `linked from`   | Notes that link to this target | `linked from "Research"`         |
| `with_property` | Frontmatter property filter    | `with_property author = "Smith"` |

### Values

Clause values support several syntaxes:

- **Plain text**: `with neural networks`
- **Tags**: `with #rust`
- **Regex**: `named /pattern/`
- **Wikilinks**: `linked from [[Note Name]]`
- **Subqueries**: `linked from { notes with #project }`

### Boolean Composition

Clauses combine with `and` / `or` and support negation:

```
notes named /ml/ and with #project
notes with #rust or with #typescript
notes not in "Archive"
```

Groups can be nested with braces `{ }` for complex logic.

### Saved Queries

Save queries as `.query` files in your vault for reuse. The query panel provides a UI for managing saved queries.

## Search Graph

**Shortcut**: `Cmd+Alt+G` (or via command palette)

The search graph is a tab-based view that combines a force-directed graph visualization with a scrollable results list. It shows search hits and their 1-hop wiki-link neighbors as an interactive network.

### How it works

1. Type a query in the search input
2. Hybrid search returns matching notes (up to 50)
3. A subgraph is extracted: hit nodes + neighbor nodes scored by connectivity
4. The view renders a split layout — graph canvas (left) and results list (right)

### Features

- **Cross-highlighting**: Click a result to highlight it in the graph; click a node to scroll the results list
- **Edge types**: Wiki links (solid), semantic similarity (dashed), smart links (dotted) — each toggleable
- **Multi-tab**: Each tab maintains its own independent query and graph state
- **Progressive disclosure**: Neighbors with 2+ connections auto-expand; others can be expanded manually
- **Persistence**: Tab queries and state are saved/restored between sessions

## Bases

Bases turns your vault's YAML frontmatter into a queryable database. It provides a form-driven UI for filtering, sorting, and browsing notes by metadata — complementary to the syntax-driven query language.

### Query Structure

Bases queries are built through the UI with dropdowns and form fields:

- **Filters**: Property + operator + value (e.g., `status = done`, `priority contains high`)
- **Operators**: `=`, `!=`, `contains`, `not contains`, `>`, `<`, `>=`, `<=`
- **Sort**: Any property, ascending or descending
- **Pagination**: 100 results per page

### Built-in Properties

In addition to any frontmatter keys found in your vault, Bases provides:

- `title` — note title
- `path` — file path
- `content` — full-text search within results
- `tag` — inline tags

### Views

- **Table**: Spreadsheet-like grid with dynamic columns
- **List**: Card layout with title, path, tags, and property grid

### Saved Views

Save filter/sort/view configurations as named views. Stored as JSON in `<vault>/.carbide/bases/`. Load, switch between, or delete saved views from the panel.

For more detail, see [Bases & References](./bases_and_references.md).

## Task Queries

A specialized query language for filtering, sorting, and grouping Markdown tasks (`[ ]`, `[-]`, `[x]`). Used in the task panel's list, kanban, and schedule views.

### Syntax

One clause per line. Lines starting with `#` are comments.

#### Status Filters

```
is todo
is doing
is done
status is done
```

#### Property Filters

```
path includes "Projects"
section includes "Work"
text includes "urgent"
```

#### Date Filters

```
due before 2026-04-30
due after 2026-04-01
due on today
due on 2026-04-25
has due date
no due date
```

#### Sort and Group

```
sort by status
sort by due_date desc
sort by text
group by status
group by note
group by section
group by due_date
limit 50
```

### Grouping Modes

| Mode       | Groups tasks by              |
| ---------- | ---------------------------- |
| `none`     | Flat list                    |
| `status`   | Todo / Doing / Done          |
| `note`     | Which note contains the task |
| `section`  | Heading within the note      |
| `due_date` | Due date                     |

## Hybrid Search (Engine)

All note search surfaces are backed by hybrid search, which fuses two retrieval strategies:

1. **Full-text search**: SQLite FTS5 with BM25 ranking
2. **Semantic search**: 384-dimension embeddings (candle BGE-small) indexed in an HNSW vector index

Results are merged via **Reciprocal Rank Fusion (RRF)** in the Rust backend, combining lexical precision with semantic recall. Enable or tune embeddings under **Settings → Semantic**.

Semantic search also powers:

- **Find similar notes**: Given a note, find semantically related notes
- **Find similar blocks**: Section-level similarity for discovering related content across notes
- **Semantic edges in graph view**: Configurable similarity threshold for showing connections
