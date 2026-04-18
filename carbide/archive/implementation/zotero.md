# Zotero Integration Brainstorm

## What is Zotero?

Open-source (AGPL v3) reference manager by Corporation for Digital Scholarship. Built on Firefox/Gecko engine, JS core, SQLite storage, React UI (Zotero 7+). 10,000+ citation styles via CSL. Massive community-maintained translator ecosystem (hundreds of site-specific scrapers for JSTOR, PubMed, arXiv, Google Scholar, library catalogs, etc.).

## Apps with Zotero Integration

### Note-Taking / PKM (Direct Competitors)

| App               | Integration Style                                                                                         | Mechanism                                                                                                                                                                                              |
| ----------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Obsidian**      | Community plugin ([obsidian-zotero-integration](https://github.com/mgmeyers/obsidian-zotero-integration)) | Better BibTeX JSON-RPC API or exported BibTeX/CSL JSON. `@` citation picker, Pandoc `[@citekey]` syntax                                                                                                |
| **Logseq**        | Built-in                                                                                                  | Zotero Web API (API key + User ID). Block references of PDF highlights with page numbers. Also has a [local plugin](https://github.com/benjypng/logseq-zoterolocal-plugin) for Zotero 7+ without cloud |
| **Roam Research** | Community plugin                                                                                          | Less well-documented than Obsidian/Logseq                                                                                                                                                              |
| **Notion**        | Notero plugin                                                                                             | Syncs Zotero items to Notion databases. Not deep                                                                                                                                                       |

### Writing Tools

| App                | Mechanism                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------- |
| **Microsoft Word** | Plugin installed by default. Toolbar for Add/Edit Citation/Bibliography. Local connector protocol |
| **LibreOffice**    | Optional plugin, same as Word                                                                     |
| **Google Docs**    | Via Zotero Connector browser extension. Adds a Zotero menu to Docs                                |
| **Overleaf**       | Links Zotero account, syncs `.bib` files for LaTeX citations                                      |

### AI / Research Tools

- **ResearchRabbit**: Bidirectional sync of Zotero collections. Uses Semantic Scholar + OpenAlex
- **Elicit**: Imports Zotero paper collections for AI-powered data extraction
- **scienceOS**: AI-driven reference management with Zotero import
- **PapersFlow**: AI-enhanced reading and literature review with Zotero import

### Inside Zotero (Plugins)

- **Better Notes** ([zotero-better-notes](https://github.com/windingwind/zotero-better-notes)): Obsidian-style bidirectional linking, templates, mind mapping inside Zotero
- **Knowledge4Zotero**: Note linking, quick annotation links, Markdown/rich-text export

## Zotero's Integration Surface Area

### 1. Web API (v3)

- Base: `https://api.zotero.org`, auth via API key
- Endpoints: `/users/<userID>/items`, `/collections`, `/tags`, `/searches`, `/groups`
- Formats: JSON (default), Atom, XHTML bib, plus exports: `bibtex`, `biblatex`, `csljson`, `ris`, `mods`, `tei`, `rdf_zotero`, `csv`, `wikipedia`
- Search: `q` for quick search, `itemType` for Boolean type filters, `tag` for tag filters, `since` for incremental sync
- Rate limiting: `Backoff` header, `429` + `Retry-After`

### 2. Better BibTeX JSON-RPC (Local)

- URL: `http://localhost:23119/better-bibtex/json-rpc` (requires Zotero + BBT running)
- Methods: `item.search`, `item.attachments`, `item.bibliography`
- Used by: Obsidian, VS Code, Vim, Emacs plugins for citation picking

### 3. Zotero Connector Protocol

- Desktop Zotero runs HTTP server on port 23119
- Browser extensions communicate via HTTP. Connector-initiated only (no push)
- Fallback to zotero.org Web API when desktop not running

### 4. Translation Server (Standalone)

- Node.js server running Zotero translators without the full client
- Port 1969, Docker image: `zotero/translation-server`, deployable on AWS Lambda
- Endpoints:
  - `/web` — extract metadata from URLs
  - `/search` — look up by DOI, ISBN, PMID, arXiv ID
  - `/export` — convert Zotero JSON to BibTeX, RIS, etc.
  - `/import` — convert BibTeX/RIS/etc. to Zotero JSON
- Powers Wikipedia's Citoid service

### 5. Local SQLite Database

- Direct access to `zotero.sqlite` in data directory
- EAV data model: items → itemData/itemDataValues, creators, collections, tags, attachments, notes, relations
- 36+ item types (Journal Article, Book, Conference Paper, Patent, Thesis, Dataset, Software, etc.)
- Better BibTeX adds `better-bibtex.sqlite` with citation keys

### 6. Client Libraries

- **JS**: [zotero-api-client](https://github.com/tnajdek/zotero-api-client) (AGPL v3)
- **Python**: [pyzotero](https://github.com/urschrei/pyzotero) (MIT)
- **TypeScript**: [zotero-sync](https://github.com/retorquere/zotero-sync)

## Is Zotero Useful for Carbide?

### Yes — Strong Alignment

1. **Target overlap**: Researchers, academics, and knowledge workers are a core audience for both Zotero and Carbide. Zotero users are exactly the kind of power users who'd want a local-first markdown knowledge base
2. **Complementary strengths**: Zotero excels at capturing and organizing references; Carbide excels at connecting ideas, writing, and thinking. Together they form a complete research workflow
3. **Competitive necessity**: Obsidian and Logseq both have Zotero integration. Lacking it is a notable gap for research-oriented users
4. **Metadata synergy**: Carbide's frontmatter + bases/queries system is a natural fit for structured citation metadata. Query all notes citing a specific author, filter by publication year, etc.

### Caveats

- Zotero integration only matters if targeting researchers/academics. General note-takers won't care
- Adds complexity to maintain as Zotero evolves (API changes, BBT changes)
- Users who don't use Zotero get no value — must be opt-in/plugin

## Integrate vs. Reimplement

### What's Easy to Reuse (Don't Reimplement)

| Capability               | Use                                                                                                                     |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| **Translator ecosystem** | 100s of site-specific scrapers. Years of community effort. Run translation-server as sidecar or depend on user's Zotero |
| **CSL formatting**       | 10,000+ styles, locale-aware. Use citeproc-js directly (same engine Zotero uses)                                        |
| **Web API**              | Well-documented REST API for cloud-synced libraries                                                                     |
| **Better BibTeX**        | Best-in-class citation key management. Use BBT JSON-RPC when available                                                  |

### What Could Be Reimplemented (Lighter)

| Capability                                                | Library                                               | License |
| --------------------------------------------------------- | ----------------------------------------------------- | ------- |
| Citation parsing/formatting (BibTeX, RIS, DOI → rendered) | [Citation.js](https://citation.js.org/)               | MIT     |
| Full CSL processing                                       | [citeproc-js](https://github.com/Juris-M/citeproc-js) | AGPL v3 |
| DOI/ISBN metadata lookup                                  | CrossRef API, OpenAlex API, Semantic Scholar API      | Free    |
| Basic reference storage                                   | CSL JSON in frontmatter or sidecar files              | —       |

### What's Hard to Replicate

1. **Translator ecosystem**: 100s of JS scrapers, each targeting a specific publisher. Building even 20% from scratch is enormous
2. **CSL processor edge cases**: Localization, disambiguation, sorting, collapsing across thousands of styles and dozens of languages
3. **Browser connector architecture**: Two-component (background + injected scripts) with cross-browser support

## Recommended Strategy

### Tiered approach — integrate first, selectively reimplement later

**Tier 1 — Plugin: Zotero Bridge (integrate)**

- Connect to Zotero via Better BibTeX JSON-RPC (local, fast) or Web API (cloud)
- Citation picker panel: browse library, search, insert `[@citekey]` into notes
- Pull metadata into frontmatter (authors, year, DOI, journal, abstract)
- Sync PDF annotations as markdown notes
- Bases/queries over citation metadata ("all notes citing Smith 2024")
- This is what Obsidian does and it works well

**Tier 2 — Standalone: Citation.js Integration (lightweight reimplement)**

- Embed Citation.js for users without Zotero
- Parse BibTeX/RIS files, DOI lookups via CrossRef/OpenAlex
- Render citations in any CSL style
- Store references as CSL JSON — the lingua franca that Citation.js, citeproc-js, and Zotero all understand
- This gives Carbide basic reference management without requiring Zotero

**Tier 3 — Advanced: Translation Server Sidecar (optional)**

- Bundle or connect to Zotero translation-server for URL-to-metadata extraction
- "Save this webpage as a reference" without needing Zotero installed
- Docker or bundled Node.js sidecar
- Only if there's demand; adds deployment complexity

### What Carbide Should Build on Top (Unique Value)

- **Knowledge graph over references**: Not just "which notes cite which papers" but concept-level linking, semantic similarity between papers, gap detection
- **AI-powered literature analysis**: Summarize a collection, find contradictions, suggest related work (leveraging Carbide's existing AI assistant)
- **First-class PDF annotation workflow**: Read PDFs in Carbide, annotate, and have annotations automatically linked to reference metadata
- **Smart citation suggestions**: As you write, suggest relevant references from your library based on context
- **Research project views**: Dashboard showing reading progress, annotation coverage, writing status per collection

## Internal Format Recommendation

Store references as **CSL JSON** — it's the interchange format that Zotero, Citation.js, citeproc-js, and every major tool understands natively. Keep a `references.json` (or per-note frontmatter) in CSL JSON format. This keeps Carbide interoperable regardless of whether the user has Zotero.

## Decision

**Start with Tier 1 (Zotero Bridge plugin) + Tier 2 (Citation.js for standalone use).** This covers both Zotero users and non-Zotero users with minimal reimplementation. Revisit Tier 3 only if URL-to-metadata extraction becomes a frequently requested feature.
