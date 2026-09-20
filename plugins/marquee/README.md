# Marquee

A sideways glance at your to-dos. The Marquee panel pools tasks from the vault's
task index and loops them as a continuous scrolling list inside the sidebar.

## What it shows

Each row is one task: a status glyph (`[ ]` todo, `[-]` doing, `[x]` done), the
task text, and — when enabled — the note name plus the due date. Clicking a row
opens its note. The list scrolls upward in a seamless loop; hovering or focusing
the panel pauses it, and the footer reports the row count and the last refresh
time.

A section pool can add heading rows to the same list: a level glyph (`H1`, `H2`,
…), the heading title, and the note name plus the heading path. Clicking a
section row opens its note scrolled to that heading. Section rows interleave with
task rows in the one sort order below, and they are off until one of the
**Sections query** settings is set.

The task pool is selected by three independent filters, all optional:

1. **Task query** — status, task text, and a due-date window. This runs against
   the same index the Tasks panel uses (`tasks.query`).
2. **Tags** — a comma-separated list. A task is kept only when its note carries
   _every_ listed tag.
3. **Bases filter** — a single property/operator/value triple evaluated by the
   Bases query engine, e.g. `status = active`. When set, only tasks in notes
   matching that filter remain.

Tags and the Bases filter restrict by _note_, not per task, and are refreshed at
most once a minute (or immediately after a vault change). The task query is part
of every refresh.

The section pool is selected by three further settings — title, level, and the
heading path to sit under (`sections.query`). With all three empty the panel
issues no sections call at all.

## Settings

| Setting                        | Default             | Meaning                                                                                                                                                   |
| ------------------------------ | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status                         | Open (todo + doing) | Which task states feed the marquee.                                                                                                                       |
| Text contains                  | _(empty)_           | Keep only tasks whose text contains this string.                                                                                                          |
| Due date                       | Any                 | Restrict to overdue, due today, or due within 7 days.                                                                                                     |
| Require tags                   | _(empty)_           | Comma-separated tags; the note must carry all of them.                                                                                                    |
| Bases filter: property         | _(empty)_           | Frontmatter property or Bases built-in (`title`, `path`, `tag`, `task_count`, `tasks_todo`, `next_due_date`, `word_count`, …). Empty disables the filter. |
| Bases filter: operator         | `=`                 | `=`, `≠`, `contains`, `not contains`, `>`, `<`, `>=`, `<=`.                                                                                               |
| Bases filter: value            | _(empty)_           | Value compared against the property.                                                                                                                      |
| Sections query: title contains | _(empty)_           | Add heading sections whose title contains this string. Empty adds no title filter; the pool stays off until one of these three settings is set.           |
| Sections query: level          | `Any`               | Keep only `H1`, `H2`, or `H3` sections. `Any` adds no level filter.                                                                                       |
| Sections query: under heading  | _(empty)_           | Keep only sections under this heading path, e.g. `Project A/Tasks`, including that heading's own section. Empty adds no filter.                           |
| Show the note name on each row | on                  | Append the note name to each row.                                                                                                                         |
| Maximum rows                   | 40                  | 1–200 rows kept after sorting.                                                                                                                            |
| Seconds per scroll loop        | 45                  | 10–600 seconds for one full pass.                                                                                                                         |
| Refresh interval (seconds)     | 20                  | 15–600 seconds between polls.                                                                                                                             |
| Panel theme                    | Match system        | Light, dark, or follow the system preference.                                                                                                             |

Click **Refresh** in the panel footer to apply setting changes immediately
without reloading the plugin; the poll picks them up on its own otherwise.

Rows are ordered by due date, soonest first, with undated tasks last and ties
broken by note path. Section rows carry no due date, so they sort in the same
pass by their own path and heading line.

## Permissions

| Permission         | Used for                                                              |
| ------------------ | --------------------------------------------------------------------- |
| `ui:panel`         | Registering the sidebar panel.                                        |
| `tasks:read`       | `tasks.query` — the task pool.                                        |
| `sections:read`    | `sections.query` — the section pool.                                  |
| `search:read`      | Resolving the required-tags filter to note paths.                     |
| `metadata:read`    | Running the Bases filter.                                             |
| `events:subscribe` | Refreshing on vault changes (best-effort; the poll is the guarantee). |
| `actions:execute`  | Opening a note when a row is clicked.                                 |

## Data caps

- The task pool is fetched with `limit: 200` and then trimmed to **Maximum
  rows**.
- The section pool is fetched with `limit: 200` and joins the same row cap.
- The Bases filter resolves at most **500** notes; tasks in other notes are
  dropped.

## Theme

The panel is a sandboxed iframe, so it does not inherit the app's theme tokens.
It ships its own light and dark palettes and picks between them with the **Panel
theme** setting (`Match system` follows `prefers-color-scheme`).
