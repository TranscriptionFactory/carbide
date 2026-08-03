# AI & Vault Chat

Carbide's AI surface has three parts: **provider configuration**, **inline ask/edit** in
the editor, and the **assistant** — sessions, runs, proposals, editing the open tab, and a
multi-turn, citation-backed chat over your vault. The same retrieval pipeline that powers
chat is also exposed to external agents over MCP.

All AI features are local-first: they run through whatever provider you configure (a local
CLI or a local HTTP server). Nothing is sent anywhere you haven't pointed Carbide at.

**How the code is split.** `rag` owns retrieval and index readiness and nothing else — it is
session-blind, and the assistant reaches it through a port. `assistant` owns sessions, the
run kernel, proposals, ambient notices, the chat turn and editing the open tab. `ai` owns
providers and inline edit/ask with its diff. Anything a conversation knows lives in
`assistant`; anything about finding notes lives in `rag`.

## AI providers

Providers are configured under **Settings → AI**. The master **Enable AI** toggle
(`ai_enabled`) gates every AI feature; the **Default Provider** is used when no per-session
provider is chosen.

Two transport kinds are supported:

- **CLI** — Carbide spawns a command and streams its output.
- **API** — Carbide calls an OpenAI-compatible HTTP server.

Built-in presets:

| Preset                     | ID             | Transport | Endpoint / command                |
| -------------------------- | -------------- | --------- | --------------------------------- |
| Claude Code                | `claude`       | CLI       | `claude`                          |
| Codex                      | `codex`        | CLI       | `codex`                           |
| Ollama                     | `ollama`       | CLI       | `ollama run <model>` (`qwen3:8b`) |
| LM Studio (server)         | `lmstudio`     | API       | `http://localhost:1234/v1`        |
| llama.cpp (`llama-server`) | `llama-server` | API       | `http://localhost:8080/v1`        |

**Auto-resolution.** When the default provider is set to `auto`, Carbide resolves to the
first available provider in the list. CLI presets are probed for the command on `PATH`; API
presets (LM Studio, llama.cpp) are treated as always-available, since reachability can only be
confirmed by an actual request. You can also add custom providers with your own command/args
or base URL.

## Inline ask / edit

From the editor, open the inline AI menu (`Cmd/Ctrl+Shift+I`) to **ask** a question or
**edit** the current selection. Edits arrive as a diff with an **accept / reject** flow, so
nothing changes until you approve it.

Prompts are composed with vault and editor context: the active note, the selection, and —
when **vault context** is enabled — semantically similar notes and their links. Inline
commands are customizable under **Settings → AI → Inline AI Commands**, where you can override
the built-ins or add new ones.

An accepted inline edit is recorded as an **inline session** (⌁), so it appears in the same
session list as your chats and can be reopened.

## Assistant panel (bottom tab)

The bottom **Assistant** tab is a projection of the one assistant chat — the same
conversation as the sidebar **Chat** view, mounted where a drafting surface used to live.
Open it with `Cmd/Ctrl+Shift+A`, from the **Assistant** command in the omnibar, from the
**Tools** menu, or by picking the **Assistant** tab in the bottom panel.

Opening it seeds an untouched conversation with what you are looking at: an open note
becomes a "This note" scope; an open editable document is attached. A conversation already
in progress is never re-scoped.

### Editing the open tab

The composer's secondary **Edit** button proposes a rewrite of the open tab — a whole note,
or an editable document such as an `.html` artifact. You can also attach the document with
the **This document** button and ask questions about it.

- The result is never applied directly: it lands as a **proposal** in the review centre,
  exactly like an agent turn's edits (two explicit acts, never one).
- Accepting a **document** proposal stages the change into the open tab's buffer and marks
  the tab dirty; saving the tab is what writes disk. Document-only batches take no
  checkpoint — the checkpoint is a disk undo unit.
- A stopped, errored or empty run proposes nothing — a partial stream never becomes a
  whole-file rewrite.
- Selection-scoped edits live in the inline menu, not here.

## Ambient notices

Carbide can surface **notices** about the note you are editing — a link pointing at a note
that does not exist, or a note nothing links to.

Notices are **opt-in and offer-only**. Nothing here edits a note. Accepting a notice produces
a **proposal**, and that proposal still has to be accepted in review before anything reaches
disk — two explicit acts, never one. Notices are in-memory: restarting clears them.

## Vault Chat

Vault Chat is a sidebar **Chat** view that answers questions by retrieving across your vault
and citing the notes it used.

**Open it** from the sidebar **Chat** icon, or run the **Chat with Vault** command from the
omnibar/command palette.

### Ask and agent modes

The composer has two modes:

- **Ask** — retrieval-backed question answering. The model reads; it does not write.
- **Agent** — the model can use tools to change notes in your vault. Available only for
  providers with a tool-capable backend; the mode toggle is disabled otherwise.

Agent mode has two permission levels. **Safe** limits the agent to note tools; **power**
lifts that limit. The panel shows which backend is in play — _vault-scoped_ for the native
loop, _full access_ for a Claude Code agent with system access.

Agent edits do not land directly. They arrive as **proposals** with per-hunk accept/reject,
reviewable in the proposals tab as well as in the conversation.

### How retrieval works

Each question runs through a retrieval pipeline before the model ever sees it:

1. **`@`-mentions** in your question pin specific notes — those are always included as
   context, ranked above retrieved results.
2. The question is **rewritten** using the conversation history (so follow-ups resolve
   pronouns and dangling references) and **analyzed** for a topic and any date range.
3. **Hybrid retrieval** runs two searches in parallel — SQLite FTS5 + local embeddings merged
   via Reciprocal Rank Fusion, plus block-level semantic search for the most relevant
   sections — and merges them.
4. **Scope filters** (notes / folders / tags / Bases views) restrict the candidate set. Every
   dimension you add narrows further — they intersect, they do not widen.
5. Notes already cited earlier in the conversation get a small ranking **boost** for
   continuity.
6. The top results are assembled into a **token-budgeted context** (deduplicated by note,
   truncated to fit the budget), then sent to your provider.

The answer streams back with inline numbered markers (`[1]`, `[2]`, …). Each marker maps to a
source in the citation list; **click a citation to open that note**.

### Sessions

Every conversational AI surface produces **sessions** from one model, persisted per vault
and distinguished by kind:

| Kind   | Glyph | Comes from                    |
| ------ | ----- | ----------------------------- |
| chat   | ◈     | the sidebar Chat panel        |
| note   | ▤     | a thread anchored to one note |
| inline | ⌁     | an inline editor ask/edit     |

- **Auto-titled** from your first message (trimmed to ~60 characters).
- **Rename** or **delete** any session; the list is sorted by most-recently-updated, and can
  be filtered by kind.
- **Start a new chat** at any time; switching sessions restores its full history.

**Runs** are the in-flight half of the same model. A run in progress is listed in the runs
popover with its elapsed time and a stop button, whatever surface started it.

### Scope, templates, and provider

- **Scope chips** — narrow a conversation to **this note**, one or more **folders**,
  **tags**, or **Bases** saved views. The active scope is stored with the session.
- **This note** — scopes the chat to the note you have open. It **snapshots** that note
  rather than following the active tab: the chip reads _This note_ while they are the same
  note and switches to the note's own title once you navigate away, so a saved conversation
  never silently restates what its earlier turns searched. Click it again to retarget, or
  dismiss the chip to clear it.
- **Templates** — scope-aware quick-starts: **Summarize**, **Action items**,
  **Open questions**, and **Timeline**. They expand into a prompt phrased against the current
  scope.
- **Per-session provider** — pick which configured provider answers this session,
  independent of the global default.

## Chat over MCP

Carbide's MCP server exposes the Vault Chat pipeline to external agents (Claude Desktop,
Claude Code) through two tools:

- **`rag_query`** — ask a question and get a cited answer retrieved across the whole vault,
  using the same retrieval and citation pipeline as in-app Vault Chat. Accepts an optional
  `folder` or `tag` to scope retrieval. Returns the answer with `[N]` markers followed by a
  **Sources** list mapping each marker to a note path. **Requires the Carbide desktop app to
  be running** — the retrieval pipeline is not available in headless mode.
- **`rag_status`** — report RAG readiness for a vault: embedding model version, how many notes
  are embedded, whether indexing is in progress, and whether the in-app query bridge is
  available.

See the MCP setup flows in [Plugin How-To](./plugin_howto.md).

## Storage

- **Assistant sessions** live under `<VAULT>/.carbide/assistant/` — an `index.json` summary
  plus one `sessions/<id>.json` file per conversation, covering every session kind. Sessions
  written before the assistant slice existed are read from the legacy
  `<VAULT>/.carbide/rag/` and rewritten into the new location on the next save.
- **Embeddings and the search index** live in the per-vault SQLite cache database
  (`~/.carbide/caches/vaults/{VAULT_ID}.db`), shared with omnibar and semantic search.

See [Data Storage](./data_storage_locations.md) for the full layout.
