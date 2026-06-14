# Bases & References

## Bases

Bases turns your vault into a queryable database. Every note's YAML frontmatter is indexed, and Bases lets you filter, sort, and browse notes by their metadata properties.

### Quick Start

1. Open the sidebar and switch to the **Bases** panel
2. Click **Refresh** to load properties from your vault
3. Add a filter (e.g., `status = done`) and click **Add**
4. Results appear in table or list view — click any row to open the note

### Frontmatter as Data

Bases reads standard YAML frontmatter at the top of each `.md` file:

```yaml
---
status: done
priority: high
due: 2026-04-01
tags:
  - project
  - design
---
```

Every key becomes a filterable property. Types (string, number, date) are inferred automatically.

### Filtering & Sorting

Open the **Filters** panel (funnel icon) to build queries:

- **Property**: Pick from a dropdown of all properties found in your vault (shows how many notes have each)
- **Operator**: `=`, `!=`, `contains`, `>`, `<`, `>=`, `<=`
- **Value**: Freeform text input

Multiple filters combine with AND logic. Use **Clear all** to reset.

Sort by any property (including Title and Modified) in ascending or descending order via the sort controls at the bottom of the filter panel. In table view, clicking column headers also toggles sort.

### Views

- **Table**: Spreadsheet-like grid with dynamic columns for each property. Tags shown in the last column.
- **List**: Card layout showing title, path, tags as pills, and a property grid.

Toggle between views using the icons in the panel header.

### Saved Views

Save a query + view mode for quick access:

1. Open the **Saved Views** panel (folder icon)
2. Type a name and press Enter or click Save
3. Views are stored as JSON files in `<vault>/.carbide/bases/`

Load a saved view to restore its filters, sort, and view mode. Delete views you no longer need.

### Pagination

Results are paginated (100 per page). Use Prev/Next buttons and the "X–Y of Z" counter in the footer to navigate.

### Embedded Base Blocks

Beyond the sidebar panel, a Bases view can be embedded directly inside a note as a live Smart Block. A ` ```base ` fenced block renders any of the six views inline, driven by a query-language expression:

````markdown
```base
view: kanban
group_by: status
query: notes with #project-x
```
````

- `view` selects the renderer (`table`, `list`, `kanban`, `gallery`, `calendar`, `tree`); `group_by` and `date_property` configure kanban/tree and calendar respectively.
- A view switcher above the block lets you change modes inline, and in-view config edits are written back into the block body — so the note file is the single source of truth (no separate saved view needed).
- Large result sets are capped at 1000 rows with a visible "Showing N of M" indicator.
- Insert one via the command palette: **Insert Base View**.

Each embedded block has its own independent state, so multiple base blocks in one note don't interfere. For the full Smart Blocks reference (query and backlinks blocks, insertion, live behavior), see [Search & Queries → Smart Blocks](./search_and_queries.md#smart-blocks-live-embeds).

---

## References

References is a citation manager built into Carbide. Import academic references, insert citations into notes, manage linked PDF folders, and export bibliographies — all without leaving the editor.

### Quick Start

1. Enable references in **Settings > References**
2. Open the **References** panel in the sidebar (bookmark icon)
3. Search your library or connected Zotero instance
4. Click a result to insert a `[@citekey]` citation at your cursor

### Adding References

| Method                     | How                                                                               |
| -------------------------- | --------------------------------------------------------------------------------- |
| **Zotero / Better BibTeX** | Connect via extension — searches your Zotero library in real time                 |
| **DOI lookup**             | Run `Reference: Lookup DOI` from command palette — fetches metadata from CrossRef |
| **BibTeX import**          | Run `Reference: Import BibTeX` — paste BibTeX text                                |
| **RIS import**             | Run `Reference: Import RIS` — paste RIS text                                      |
| **Linked sources**         | Register a folder of PDFs — metadata extracted automatically                      |

All references are stored locally in `<vault>/.carbide/references/library.json`.

### Citation Picker

The citation picker searches across your local library and any connected extensions (Zotero/BBT). Results show title, authors, and year.

**Click behavior depends on the item type:**

- **Library / extension items**: Inserts `[@citekey]` at cursor and syncs reference metadata to the note's frontmatter
- **Linked source items** (indicated by a link icon): Opens the PDF in the document viewer

### Frontmatter Sync

When you insert a citation, the note's frontmatter is automatically updated with denormalized reference data:

```yaml
---
references:
  - citekey: smith2024
    title: "The Impact of AI on Research"
    authors: "Smith, John; Doe, Jane"
    year: 2024
    doi: "10.1234/example"
    journal: "Nature"
---
```

This makes references queryable via Bases — filter notes by author, year, journal, etc.

### Linked Sources

Linked sources let you register external folders of PDFs and HTML files. Carbide scans them, extracts metadata (title, author, DOI, keywords), and indexes full text for search — without copying files into your vault.

**Adding a linked source:**

1. In the References panel, find the **Linked Sources** section
2. Click the **+** button (FolderPlus icon)
3. Select a folder containing your PDFs or HTML files
4. Carbide scans the folder and extracts metadata from each file

**What gets extracted from PDFs:**

- Title, author, subject, keywords from the PDF info dictionary
- DOI (regex-scanned from first 2 pages)
- Full text content (indexed for search)

**Management:**

- **Toggle**: Enable/disable a source without removing it
- **Rescan**: Force a fresh scan to pick up new or modified files
- **Remove**: Unregister the folder and optionally delete its references

Status badges show scanning progress (spinner), errors (red), or idle state.

**Full-text search integration**: Linked source content appears in global search results alongside vault notes.

### Zotero Integration

Carbide connects to Zotero Desktop via the Better BibTeX (BBT) plugin:

1. Install [Zotero](https://www.zotero.org/) and the [Better BibTeX](https://retorque.re/zotero-better-bibtex/) plugin
2. Ensure Zotero is running (BBT exposes an RPC endpoint at `localhost:23119`)
3. The citation picker automatically searches Zotero when you type

Connection status is shown in the picker header — green plug (connected) or gray plug (disconnected). Use `Reference: Test Connection` from the command palette to verify.

### Annotation Sync

Pull PDF highlights and notes from Zotero into your note:

1. Run `Reference: Sync Annotations` from the command palette
2. Highlights are grouped by page and formatted as markdown with color labels

### Exporting

Export selected references in multiple formats:

| Format                | Action                                                              |
| --------------------- | ------------------------------------------------------------------- |
| **BibTeX** (`.bib`)   | `Reference: Export as BibTeX`                                       |
| **RIS** (`.ris`)      | `Reference: Export as RIS`                                          |
| **HTML Bibliography** | `Reference: Export Bibliography as HTML` (with CSL style selection) |

### Bibliography Rendering

Render a formatted bibliography from cited references using CSL styles:

- **APA** (default)
- **Vancouver**
- **Harvard**
- And others

Set your preferred style in **Settings > References > Citation Style**.

### Settings

| Setting                    | Default | Description                           |
| -------------------------- | ------- | ------------------------------------- |
| `reference_enabled`        | `false` | Enable/disable the references feature |
| `reference_citation_style` | `apa`   | CSL style for bibliography rendering  |
