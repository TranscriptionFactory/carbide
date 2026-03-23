# Markdown Line Break Spec

## Goal

Define how Carbide handles paragraph breaks and hard line breaks in Markdown across source mode, visual mode, mode switches, autosave, and explicit save.

This spec is about Markdown structure, not OS-specific file line endings.

## Terms

- Paragraph break: a blank line between paragraphs.
- Hard line break: an explicit line break inside the same paragraph or block.
- Soft break: a single newline in Markdown source within a paragraph.
- Soft wrap: a visual wrap caused by editor width. It is never stored.

## Canonical Representation

- Carbide stores paragraph breaks as Markdown paragraphs separated by blank lines.
- Carbide stores hard line breaks as backslash + newline: `\\\n`.
- Carbide must not generate `<br>`, `<br/>`, `<br />`, or trailing-space hard breaks when serializing Markdown.
- Carbide may accept those forms as input, but must normalize them to `\\\n` on the next serialization boundary.

## Invariants

- `Enter` creates a new paragraph in visual mode.
- `Shift+Enter` creates a hard line break in visual mode.
- A visual wrap never changes the document.
- A soft break is not treated as a hard line break.
- A paragraph break must never be rewritten into a hard line break.
- A hard line break must never be rewritten into a paragraph break.
- Carbide uses one internal semantic for hard breaks, regardless of whether the input was `\\\n`, `<br />`, or trailing spaces.

## Source Mode

- Source mode edits Markdown source directly.
- Plain `Enter` inserts a newline character only.
- A blank line represents a paragraph break.
- `Shift+Enter` inserts the canonical hard line break form `\\\n`.
- Source mode should show Markdown-native syntax, not auto-insert HTML for line breaks.
- If a document contains `<br>`, `<br/>`, `<br />`, or trailing-space hard breaks, Carbide normalizes them to `\\\n` when the note is loaded into editor state and on later serialization boundaries.

## Visual Mode

- In a normal paragraph:
  - `Enter` splits the paragraph.
  - `Shift+Enter` inserts a hard line break inside the same paragraph.
- In list items, task list items, and blockquotes:
  - `Enter` follows the container's normal block behavior.
  - `Shift+Enter` inserts a hard line break inside the current item or quote.
- In fenced or indented code blocks:
  - `Enter` inserts a literal newline in code content.
  - `Shift+Enter` must not create a Markdown hard-break token outside code semantics.
- Carbide serializes visual-mode hard breaks as `\\\n`.

## Round-Trip Rules

- Carbide parses these inputs as the same hard-break semantic:
  - `\\\n`
  - `<br>`
  - `<br/>`
  - `<br />`
  - two trailing spaces followed by newline
- On any serialization boundary, Carbide writes that semantic back as `\\\n`.

Serialization boundaries include:

- visual mode document export to Markdown
- visual-to-source mode switch when Markdown is regenerated
- save or autosave when the stored Markdown is refreshed from structured editor state
- any normalization pass that rewrites the full Markdown document

## Non-Goals

- Changing file-level newline encoding policy
- Defining full table-cell multiline behavior
- Preserving raw HTML break syntax for stylistic reasons

## Table Constraint

- Hard line breaks inside Markdown table cells are not part of this guarantee.
- Carbide must not introduce `<br />` just to represent table-cell line breaks.
- If full multiline table-cell support is needed, it requires a separate spec.

## Acceptance Scenarios

### Paragraph creation in visual mode

- Given a paragraph with text `one`
- When the user presses `Enter`
- Then the paragraph is split into two paragraphs
- And serialized Markdown uses a blank line between them

### Hard break creation in visual mode

- Given a paragraph with text `one`
- When the user presses `Shift+Enter` and types `two`
- Then the document contains one paragraph with a hard line break
- And serialized Markdown is `one\\\ntwo`

### Hard break creation in source mode

- Given source mode with cursor after `one`
- When the user presses `Shift+Enter` and types `two`
- Then the source becomes `one\\\ntwo`

### HTML break normalization

- Given stored Markdown `one<br />\ntwo`
- When Carbide parses and later serializes the document
- Then the serialized Markdown is `one\\\ntwo`

### Trailing-space normalization

- Given stored Markdown with two trailing spaces before newline between `one` and `two`
- When Carbide parses and later serializes the document
- Then the serialized Markdown is `one\\\ntwo`

### Backslash normalization

- Given stored Markdown `one\\\ntwo`
- When Carbide parses and later serializes the document
- Then the serialized Markdown is `one\\\ntwo`

### Soft break preservation

- Given source Markdown with a single newline inside a paragraph and no hard-break marker
- When the document is opened and saved without semantic edits
- Then Carbide does not upgrade that soft break into a hard line break

### List item hard break

- Given a list item with text `one`
- When the user presses `Shift+Enter` inside that item and types `two`
- Then the line break stays within the same list item
- And serialized Markdown uses `\\\n` at that point

### Code block newline

- Given the cursor inside a fenced code block
- When the user presses `Enter`
- Then Carbide inserts a literal code newline
- And it does not serialize that newline as a hard line break token
