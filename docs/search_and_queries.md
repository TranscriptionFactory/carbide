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

## @ Palette (Inline Mentions)

**Trigger**: Type `@` in the editor (must be preceded by whitespace or start of line).

The `@` palette is an inline autocomplete that lets you quickly insert wiki links, headings, dates, tags, citations, and commands without leaving the editor. Results appear in a dropdown grouped by category.

### Category Prefixes

By default, typing `@query` searches across all categories simultaneously. Prefix the query to restrict to a single category:

| Prefix | Category              | Example          | Inserts                 |
| ------ | --------------------- | ---------------- | ----------------------- |
| `/`    | Notes (markdown only) | `@/meeting`      | `[[meeting notes]]`     |
| `//`   | Notes (all files)     | `@//paper`       | `[[paper.pdf]]`         |
| `#`    | Headings              | `@#introduction` | `[[note#Introduction]]` |
| `[`    | References            | `@[smith`        | `[@smith2024]`          |
| `>`    | Commands              | `@>toggle`       | executes the command    |
| `d `   | Dates                 | `@d tomorrow`    | `[[2026-04-30]]`        |
| `t `   | Tags                  | `@t project`     | `#project`              |

Without a prefix, all categories are queried and results appear in this display order: Dates → Notes → Headings → Tags → References → Commands.

### How Each Category Resolves

- **Notes**: FTS via `suggest_wiki_links` — searches existing note titles and paths, interleaved with planned (unresolved) link targets sorted by reference count.
- **Headings**: Resolves the note name (if given), then lists its headings. Without a note prefix, uses headings from the current note.
- **Tags**: Searches all tags in the vault, ranked by usage count.
- **References**: Filters the in-memory citation library (BibTeX/CSL-JSON from linked sources) by citekey, title, and author. First 20 matches shown.
- **Dates**: Parses natural language dates ("tomorrow", "next friday", "2026-05-01") and shows preset suggestions (today, yesterday, etc.).
- **Commands**: Filters available editor commands by label and description.

### Navigation

- **Arrow keys**: move selection
- **Enter / Tab**: accept the selected item
- **Escape**: dismiss the palette

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

## Smart Blocks (Live Embeds)

Smart Blocks turn a fenced code block into live, self-updating content generated from a query rather than typed by hand. A Smart Block re-renders automatically when the vault changes, and reuses Carbide's existing engines — the query language, Bases views, and the backlinks index — so there is one mental model, not a separate query DSL bolted on.

A Smart Block is a fenced code block keyed by its language:

| Language    | Renders                                                          | Backed by                         |
| ----------- | ---------------------------------------------------------------- | --------------------------------- |
| `query`     | A live, clickable list of matching notes                         | [Query Language](#query-language) |
| `base`      | An embedded Bases view (table/list/kanban/gallery/calendar/tree) | [Bases](#bases)                   |
| `backlinks` | A live list of notes linking to the current note                 | Backlinks index                   |
| `tasks`     | A live task list with interactive checkboxes                     | [Task Queries](#task-queries)     |

> The `tasks` block shipped earlier; `query`, `base`, and `backlinks` are the newer additions.

### Query Block

Lists the notes matching a [query](#query-language), refreshed live as the vault changes. Click a row to open the note.

````markdown
```query
notes with #project-x in "work"
```
````

The body is a query-language expression (the same syntax as the query panel and omnibar — space-separated clauses, **not** `with:#tag`). An invalid query renders the parser error and its caret position inline instead of crashing.

### Backlinks Block

Lists notes that link to the current note. Add `show: outlinks` to list outgoing links instead of backlinks.

````markdown
```backlinks
show: outlinks
```
````

An unsaved buffer (no file path yet) shows a "save note to see backlinks" hint rather than an error.

### Base Block

Embeds any of the six Bases views inline, driven by a query. The body is a set of `key: value` lines:

````markdown
```base
view: kanban
group_by: status
query: notes with #project-x
```
````

| Key             | Meaning                                                               |
| --------------- | --------------------------------------------------------------------- |
| `view`          | `table` (default), `list`, `kanban`, `gallery`, `calendar`, or `tree` |
| `query`         | A query-language expression selecting the rows (**required**)         |
| `group_by`      | Grouping property for `kanban` / `tree`                               |
| `date_property` | Date property for `calendar`                                          |

**In-block view switcher** — buttons above the view switch between modes (table ↔ kanban ↔ …) without remounting the note; the choice is written back into the block body so it persists in the file. Other in-view config (kanban group-by, calendar date property, tree grouping) round-trips the same way — the note stays the single source of truth.

**Result cap** — large result sets are capped (1000 rows). When the cap applies, the block shows a "Showing N of M" line rather than truncating silently.

See [Bases & References](./bases_and_references.md#embedded-base-blocks) for more on the underlying views.

### Inserting blocks

From the command palette (`Cmd+P` / `Ctrl+P`):

- **Insert Query Block**
- **Insert Base View**
- **Insert Backlinks Block**

Each drops a ready-to-edit scaffold at the cursor.

### Behavior shared by all Smart Blocks

- **Live** — every block subscribes to vault changes, debounces (~150 ms), and re-runs its query.
- **Source / preview toggle** — each block keeps the standard code-block Edit/Preview toggle, so you can see and edit the source.
- **Viewport-gated** — a block defers its query until it scrolls into view, so notes with many blocks stay responsive.
- **Explicit states** — each block renders distinct loading, empty ("No results"), and error states.

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

#### Boolean Operators

Combine filter clauses on a single line with `AND`, `OR`, `NOT`. Operands must be parenthesized:

```
(section includes urgent) OR (section includes reminders)
(status is todo) AND (due before 2026-05-01)
NOT (status is done)
((status is todo) AND (path includes projects)) OR (section includes urgent)
```

- Multiple lines are still implicitly ANDed (backward compatible)
- Precedence: `NOT` > `AND` > `OR`
- `not done` remains a shorthand for "status is not done" (no parens needed)

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
