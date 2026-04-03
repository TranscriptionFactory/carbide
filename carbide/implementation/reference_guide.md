# Reference Manager — User Guide

Carbide integrates with Zotero to let you search, cite, and annotate academic references directly from your notes.

## Prerequisites

1. **Zotero Desktop** — [zotero.org/download](https://www.zotero.org/download/)
2. **Better BibTeX (BBT) plugin** — [retorque.re/zotero-better-bibtex/installation](https://retorque.re/zotero-better-bibtex/installation/)
3. Both must be running when you use reference features in Carbide

## Setup

Open vault settings and configure three options under **Tools**:

| Setting                    | Default                                         | Description                                                                  |
| -------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------- |
| `reference_enabled`        | `false`                                         | Turns the feature on. Must be enabled first.                                 |
| `reference_bbt_url`        | `http://localhost:23119/better-bibtex/json-rpc` | BBT endpoint. Default works for standard Zotero installs.                    |
| `reference_citation_style` | `apa`                                           | CSL style for rendered bibliographies (`apa`, `vancouver`, `harvard1`, etc.) |

After enabling, the **References** sidebar panel appears (bookmark icon).

### Test Connection

Click the plug icon in the References sidebar header. A green **PlugZap** icon means Zotero is connected; a gray **Plug** icon means it's not reachable. Make sure Zotero is running with BBT installed.

## Searching & Inserting Citations

1. Open the **References** sidebar (bookmark icon, or run `reference.open_picker`)
2. Type in the search box — searches your local library and Zotero simultaneously (250ms debounce)
3. Click a result to insert `[@citekey]` at your editor cursor

When you insert a citation:

- The reference is auto-imported to your local library if it came from Zotero
- Frontmatter is updated with reference metadata, making it queryable via Bases

### Frontmatter Format

Each cited reference appears in the note's YAML frontmatter:

```yaml
references:
  - citekey: smith2024
    authors: "John Smith"
    year: 2024
    title: "Paper Title"
    doi: "10.1234/example"
    journal: "Nature"
```

Inserting the same citekey twice updates the existing entry (no duplicates). You can query these properties in Bases — e.g., filter notes where `references.year = 2024`.

## Importing References Without Zotero

You don't need Zotero for everything. These work standalone:

- **BibTeX import** (`reference.import_bibtex`) — paste `.bib` entries to add them to your library
- **RIS import** (`reference.import_ris`) — paste RIS-format entries
- **DOI lookup** (`reference.lookup_doi`) — enter a DOI, metadata is fetched from CrossRef

## PDF Annotation Sync

Pull highlights, notes, and underlines from your Zotero PDFs into Carbide.

1. Run `reference.sync_annotations` for a citekey
2. Annotations are saved as markdown at `<vault>/.carbide/references/annotations/<citekey>.md`
3. Open the file in the editor to view them

Annotations are grouped by page with type and color labels:

```markdown
# Annotations: smith2024

## Page 12

- **Highlight (Yellow)**, p. 12
  > The key finding was statistically significant.
  > My comment about this finding

## Page 25

- **Note**, p. 25
  Need to revisit this methodology section
```

Re-syncing is additive — new annotations from Zotero are merged in without losing existing ones.

## Rendering Bibliographies

Select references and run `reference.render_bibliography` to generate a formatted bibliography in your configured CSL style. Output respects the `reference_citation_style` setting.

## Storage

- **Reference library**: `<vault>/.carbide/references/library.json` — full CSL JSON metadata for all imported references
- **Annotation notes**: `<vault>/.carbide/references/annotations/<citekey>.md` — per-reference annotation markdown
- **Per-note metadata**: YAML frontmatter `references` array — denormalized for Bases queries

All data lives in your vault. No cloud sync, no external accounts required (except optional DOI lookup via CrossRef).

## Quick Reference: Actions

| Action                             | What it does                                     |
| ---------------------------------- | ------------------------------------------------ |
| `reference.open_picker`            | Open the References sidebar                      |
| `reference.insert_citation`        | Insert `[@citekey]` at cursor + sync frontmatter |
| `reference.test_zotero_connection` | Check if Zotero/BBT is reachable                 |
| `reference.search_zotero`          | Search Zotero library                            |
| `reference.import_from_zotero`     | Import citekeys into local library               |
| `reference.import_bibtex`          | Import from BibTeX text                          |
| `reference.import_ris`             | Import from RIS text                             |
| `reference.lookup_doi`             | Fetch metadata for a DOI                         |
| `reference.render_bibliography`    | Render formatted bibliography                    |
| `reference.sync_annotations`       | Pull PDF annotations from Zotero                 |
| `reference.remove_reference`       | Remove a reference from library                  |
