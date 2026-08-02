---
"carbide": minor
---

feat(assistant): the panel scopes to the note you are reading, and Carbide can offer link fixes in the margin

The chat panel's scope bar gains a **This note** chip. Turning it on restricts retrieval to the note
you are currently reading, alongside the folder, tag and base chips that were already there.

The chip **snapshots** the note when you turn it on; it does not silently follow you. Navigate
somewhere else and the chip re-labels itself from "This note" to that note's title, so the scope bar
never claims a scope it is not holding — click it again to re-point it at whatever you are reading
now. A question already in flight is unaffected by changing notes mid-answer. If the scoped note is
renamed or deleted, the chat tells you the scope matched nothing rather than quietly answering from
the whole vault.

**Ambient link checks — off by default, on per vault.** Enable them in Settings → Editor and Carbide
watches the note you are reading for two things it can be certain about: links pointing at notes that
no longer exist, and a note nothing links to yet. Findings appear as cards in the editor's right
margin, anchored to the text they are about.

Ambient never edits anything. A card offers one action and a dismiss, and accepting an offer queues a
**proposal** you review like any other AI edit — the same queue, the same checkpoint, the same
apply. A finding with no reliable repair carries no offer at all: "Nothing links to this note yet"
states the fact and leaves, rather than inventing a link into some other note to have something to
suggest. The checks read a single indexed lookup per note and never touch the vault graph, so turning
them on does not make opening a note slower.

**Chat over MCP now behaves like chat in the app.** Two fixes, both user-visible:

- **Your retrieval settings apply to MCP.** `rag_query` ignored `ai_rag_retrieve_limit` and
  `ai_rag_context_token_budget` and answered at the built-in defaults instead. Because those defaults
  happen to equal the shipped setting values, this was invisible until you moved either slider — at
  which point the app honoured you and MCP did not. If you run off-default settings, MCP answers will
  change to match what the panel gives you.
- **MCP respects the AI kill switch.** Turning the assistant off in settings did not stop `rag_query`
  from answering. It now declines, and does so before probing for a provider.

Two smaller changes you may notice:

- **Background runs get their own glyph (`◌`) in the runs popover.** They previously shared `▤` with
  note runs, which made the two indistinguishable in the one surface built to tell runs apart.
- The inline AI command set is resolved once per invocation instead of twice, and not at all when you
  retry — the retry path was recomputing a value it never read.

Under the hood, the retrieval engine and the conversation have been separated: `rag` now owns
retrieval and readiness only, and everything conversation-shaped — prompts, citations, streaming,
scope, agent turns, the panel and the MCP bridge — belongs to the assistant. This is why the same
question now gets the same treatment whichever surface you ask it from.
