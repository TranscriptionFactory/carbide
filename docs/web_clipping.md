# Web Clipping

Save any web page into your vault as a Markdown note, a searchable HTML
artifact, an EPUB you read in-app, or all three at once. Clipped output is
localized (images downloaded into the vault), carries provenance back to the
source URL, and is full-text indexed like any other file.

## Clipping a page

Run **Clip Web Page** from the command palette (`Cmd+K` / `Ctrl+K`) to open the
clipper dialog:

| Field                   | Purpose                                                                          |
| ----------------------- | -------------------------------------------------------------------------------- |
| **URL**                 | The page to clip (`http` / `https`).                                             |
| **Name**                | Optional. Overrides the auto-detected page title for the filename/title.         |
| **Location**            | Vault folder to save into (defaults to the selected folder; blank = vault root). |
| **Save as**             | One or more of **Markdown note**, **HTML artifact**, **EPUB**.                   |
| **Use browser capture** | Acquire the page through a real browser window (see below).                      |

At least one output format must be selected. When multiple are selected, all
are produced from a single fetch, and the first one opens automatically.

## Acquisition modes

- **Direct fetch** (default) — Carbide fetches the page's HTML server-side. Fast,
  no window, works for most static and server-rendered pages.
- **Browser capture** — opens a real, JS-capable window that loads the page so
  you can dismiss cookie walls, sign in, or solve a challenge before capturing.
  Use it for JS-rendered pages or sites that block automated access. Enable it up
  front with **Use browser capture**, or — if a direct fetch is blocked — take the
  **Open in capture window** action on the failure toast to retry in a window.

Either way, the fetched HTML is run through readability extraction to strip
navigation, ads, and boilerplate down to the article body before conversion.

## Localized images

Images referenced by the extracted content are downloaded and rewritten to point
at local copies inside your attachment folder (the editor's **Attachment
folder** setting, default `.assets`). Images that fail to download are skipped
and reported in the success toast (`N images could not be saved`); the clip still
succeeds.

## Provenance

Every output records where it came from:

- **Markdown notes** get frontmatter: `title`, `date_created`, `source` (the
  final URL after redirects), and `clipped_at` (ISO timestamp).
- **HTML artifacts** carry source/clip provenance, shown as a banner in the
  viewer — see [HTML Artifacts → Provenance banner](./html_artifacts.md#provenance-banner).
- **EPUBs** embed the title, source URL, and clip timestamp in their metadata.

## Output formats

### Markdown note

The article is converted to Markdown and written as a note in the target folder,
with localized image links and provenance frontmatter. It edits, links, and
searches like any hand-written note.

### HTML artifact

The sanitized article is saved as an `.html` artifact next to your notes. HTML
artifacts render in **Source**, **Safe**, or **Live** mode, can be transcluded
into notes with `![[file.html]]`, and are trust-gated. See
[HTML Artifacts](./html_artifacts.md) for render modes and transclusion.

### EPUB

The article is packaged as an EPUB and opens in the in-app reader with
table-of-contents navigation, in-book search, and reading-position resume. See
[Document Viewers → EPUB reader](./document_viewers.md#epub-reader).

## Search

All three outputs are indexed into vault search — Markdown notes, HTML
artifacts, and EPUB bodies all surface in the omnibar and hybrid search
alongside the rest of your vault.
