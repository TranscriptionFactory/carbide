# AI & Vault Chat

Carbide's AI surface has three parts: **provider configuration**, **inline ask/edit** in
the editor, and **Vault Chat** — a multi-turn, citation-backed conversation over your whole
vault. The same retrieval pipeline that powers Vault Chat is also exposed to external agents
over MCP.

All AI features are local-first: they run through whatever provider you configure (a local
CLI or a local HTTP server). Nothing is sent anywhere you haven't pointed Carbide at.

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

## Vault Chat (RAG)

Vault Chat is a sidebar **Chat** view that answers questions by retrieving across the entire
vault and citing the notes it used.

**Open it** from the sidebar **Chat** icon, or run the **Chat with Vault** command from the
omnibar/command palette.

### How retrieval works

Each question runs through a retrieval pipeline before the model ever sees it:

1. **`@`-mentions** in your question pin specific notes — those are always included as
   context, ranked above retrieved results.
2. The question is **rewritten** using the conversation history (so follow-ups resolve
   pronouns and dangling references) and **analyzed** for a topic and any date range.
3. **Hybrid retrieval** runs two searches in parallel — SQLite FTS5 + local embeddings merged
   via Reciprocal Rank Fusion, plus block-level semantic search for the most relevant
   sections — and merges them.
4. **Scope filters** (folders / tags / Bases views) restrict the candidate set.
5. Notes already cited earlier in the conversation get a small ranking **boost** for
   continuity.
6. The top results are assembled into a **token-budgeted context** (deduplicated by note,
   truncated to fit the budget), then sent to your provider.

The answer streams back with inline numbered markers (`[1]`, `[2]`, …). Each marker maps to a
source in the citation list; **click a citation to open that note**.

### Sessions

Conversations are saved as **sessions**, persisted per vault:

- **Auto-titled** from your first message (trimmed to ~60 characters).
- **Rename** or **delete** any session; the list is sorted by most-recently-updated.
- **Start a new chat** at any time; switching sessions restores its full history.

### Scope, templates, and provider

- **Scope chips** — narrow a conversation to one or more **folders**, **tags**, or **Bases**
  saved views. The active scope is stored with the session.
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

- **Chat sessions** live under `<VAULT>/.carbide/rag/` — an `index.json` summary plus one
  `sessions/<id>.json` file per conversation.
- **Embeddings and the search index** live in the per-vault SQLite cache database
  (`~/.carbide/caches/vaults/{VAULT_ID}.db`), shared with omnibar and semantic search.

See [Data Storage](./data_storage_locations.md) for the full layout.
