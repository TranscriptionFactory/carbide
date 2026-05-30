# Markdown Syntax Implementation Assessment

**Date:** April 13, 2026  
**Reference:** docs/markdown-syntax-guide.md

---

## Executive Summary

This report assesses Carbide's current implementation against the Obsidian Markdown syntax guide. The codebase demonstrates strong coverage of core features (wikilinks, embeds, math, code blocks, Mermaid, tags, Canvas), but has significant gaps in advanced features (callouts, block references, footnotes, comments, frontmatter properties).

---

## Feature Coverage Matrix

| Feature Category | Status | Notes |
|-----------------|--------|-------|
| **1. Internal Linking** | | |
| Basic Wikilinks `[[Note]]` | ✅ Implemented | `src/lib/features/editor/extensions/wiki_link_extension.ts` |
| Display Text/Aliases | ✅ Implemented | Via pipe syntax |
| Heading Links `[[Note#Heading]]` | ✅ Implemented | `parse_internal_link_suffix` in `note_actions.ts` |
| Block References `[[Note#^block-id]]` | ⚠️ Partial | Link parsing exists; block ID generation/rendering incomplete |
| Link Autocomplete | ✅ Implemented | Via `wiki_link_plugin.ts` |
| Markdown-Style Links | ✅ Implemented | `markdown_link_input_rule.ts` |
| Unlinked Mentions | ❌ Not Implemented | No backlinks UI for unlinked text |
| **2. Embeds & Transclusion** | | |
| Note Embeds `![[Note]]` | ✅ Implemented | `embed_extension.ts`, `file_embed_plugin.ts` |
| Heading Embeds | ⚠️ Partial | Fragment parsing exists |
| Block Embeds | ⚠️ Partial | Link parsing exists |
| Image Embeds with Resize | ✅ Implemented | `file_embed_view_plugin.ts` |
| PDF Embeds | ✅ Implemented | With page support |
| Audio/Video Embeds | ✅ Implemented | |
| **3. Tags** | | |
| Inline Tags `#tag` | ✅ Implemented | Full implementation in `features/tags/` with TagPanel, tag tree, tag service, and prefix search |
| Frontmatter Tags | ✅ Implemented | Via YAML frontmatter parsing |
| Tag Pane/Explorer | ✅ Implemented | `TagPanel.svelte` component, toggle via `tags_toggle_panel` action |
| **4. Callouts** | | |
| Basic Callouts | ❌ Not Implemented | Only basic blockquote, not Obsidian-style |
| Foldable Callouts | ❌ Not Implemented | |
| Custom Callout Types | ❌ Not Implemented | |
| **5. Properties (YAML)** | | |
| Basic Syntax | ✅ Implemented | `frontmatter_parser.ts`, `frontmatter_writer.ts` |
| Data Types | ✅ Implemented | Text, numbers, booleans, dates, lists |
| Reserved Properties | ⚠️ Partial | `tags`, `aliases` parsed; `cssclasses`, `publish`, etc. not handled |
| Properties Editor UI | ❌ Not Implemented | No visual property editor |
| **6. Math** | | |
| Inline Math `$...$` | ✅ Implemented | KaTeX via `katex` in `math_plugin.ts` |
| Block Math `$$...$$` | ✅ Implemented | |
| LaTeX Features | ✅ Implemented | Full LaTeX support via KaTeX |
| **7. Mermaid Diagrams** | | |
| Flowcharts | ✅ Implemented | `code_block_view_plugin.ts` |
| Sequence Diagrams | ✅ Implemented | |
| Gantt Charts | ✅ Implemented | |
| Other Diagrams | ✅ Implemented | |
| **8. Highlights & Comments** | | |
| Highlights `==text==` | ✅ Implemented | `inline_mark_input_rules_plugin.ts` |
| Comments `%%text%%` | ❌ Not Implemented | No comment syntax support |
| Strikethrough | ✅ Implemented | `strikethrough_plugin.ts` |
| **9. Code Blocks** | | |
| Fenced Code Blocks | ✅ Implemented | |
| Syntax Highlighting | ✅ Implemented | Shiki with extensive language support |
| Line Numbers | ❌ Not Implemented | Noted as "not natively supported" in Obsidian too |
| **10. Footnotes** | | |
| Basic Footnotes `[^1]` | ❌ Not Implemented | |
| Inline Footnotes | ❌ Not Implemented | |
| **11. Tables** | | |
| Basic Tables | ✅ Implemented | GFM tables |
| Column Alignment | ✅ Implemented | |
| Formatting Inside Tables | ⚠️ Partial | Limited support |
| **12. Lists** | | |
| Unordered Lists | ✅ Implemented | |
| Ordered Lists | ✅ Implemented | |
| Task Lists | ✅ Implemented | |
| Nested Lists | ✅ Implemented | |
| Alternative Task Statuses | ❌ Not Implemented | |
| **13. Canvas** | | |
| Canvas Files | ✅ Implemented | Full `features/canvas/` with CanvasViewer, parser, service, actions |
| **14. Obsidian URI** | | |
| URI Scheme | ❌ Not Implemented | No `obsidian://` handler |
| **15. HTML** | | |
| Basic HTML | ⚠️ Partial | Limited subset |
| `<details>` Collapsible | ✅ Implemented | `remark_details.ts` |
| HTML Tables | ⚠️ Partial | |
| **16. Queries** | | |
| Search Query Block | ❌ Not Implemented | |
| Dataview | ❌ Not Implemented | |
| Tasks Plugin | ❌ Not Implemented | |
| **17. Templates** | | |
| Core Templates | ❌ Not Implemented | |
| Templater Plugin | ❌ Not Implemented | |
| **18. CSS** | | |
| CSS Snippets | ❌ Not Implemented | |
| cssclasses Property | ❌ Not Implemented | |

---

## Key Implementation Findings

### Strong Coverage Areas

1. **Internal Linking**: Full wikilink support with heading and fragment parsing
2. **Embeds**: Robust file/note/image/PDF/audio/video embedding system
3. **Math**: Complete KaTeX integration for inline and block math
4. **Mermaid**: Full diagram rendering with preview toggle
5. **Code Blocks**: Shiki-powered syntax highlighting with 30+ languages
6. **Tags**: Complete implementation with TagPanel, tag tree, service, and prefix search
7. **Canvas**: Full Canvas support with viewer, parser, and service
8. **Basic Markdown**: Tables, lists, task lists, strikethrough, highlights

### Critical Gaps

1. **Callouts**: No Obsidian-style callout support (the `> [!type]` syntax)
2. **Block References**: Link syntax parsed but ID generation/rendering incomplete
3. **Footnotes**: No support for `[^1]` footnote syntax
4. **Comments**: No `%%` comment syntax
5. **Properties UI**: No visual frontmatter editor

---

## Recommended Priority Features

### P0 (Critical for Obsidian Compatibility)

1. **Callouts** - High-visibility feature, widely used in Obsidian vaults
2. **Block References** - Core linking feature, needed for advanced linking

### P1 (Important for User Experience)

3. **Footnotes** - Common in academic/technical notes
4. **Comments** - Useful for drafting and collaboration
5. **Properties Editor** - Frontmatter visual editing
6. **Query/Search Blocks** - Embed live search results

### P2 (Nice to Have)

7. **Dataview** - Full query language (lower priority, more complex)
8. **Template System** - Templater-like functionality
8. **Template System** - Templater-like functionality
9. **CSS Customization** - Snippets and cssclasses

---

## Codebase Reference

| Feature | Primary Files |
|---------|---------------|
| Wikilinks | `extensions/wiki_link_extension.ts`, `adapters/wiki_link_plugin.ts` |
| Embeds | `extensions/embed_extension.ts`, `adapters/file_embed_plugin.ts` |
| Math | `extensions/math_extension.ts`, `adapters/math_plugin.ts` |
| Mermaid | `adapters/code_block_view_plugin.ts` |
| Syntax Highlighting | `adapters/shiki_highlighter.ts` |
| Frontmatter | `shared/domain/frontmatter_parser.ts`, `metadata/` |
| Tags | `features/tags/` (full implementation: TagPanel, service, actions, tree) |
| Tables | ProseMirror table nodes |

---

## Conclusion

Carbide has strong fundamentals in linking, embeds, tags, code, and math rendering. The main gaps are callouts, block references, and footnotes — features central to the Obsidian note-taking experience. Prioritizing callouts and block references would provide the biggest improvement in Obsidian vault compatibility.
