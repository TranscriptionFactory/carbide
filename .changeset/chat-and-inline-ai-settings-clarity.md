---
"carbide": patch
---

Separate the chat retrieval settings from the inline-AI ones, and let the
provider window size the chat context budget

Settings → AI ran as one undifferentiated list, so five controls that govern
three different surfaces read as five knobs on the same one. Two of them are not
chat settings at all: **Similar Notes Limit** and **Similarity Threshold** are
read by inline AI and by generated note descriptions, and never by vault chat,
which sizes its own retrieval from **Chat Retrieval Sources**. The section now
carries headings — _Chat retrieval_, _Inline AI vault context_ and
_Conversations_ — and each description in the second group says which surface
reads it and that vault chat does not. The **Include Vault Context** toggle at
the head of that group is narrower than its position suggests and now says so:
it switches context on for generated descriptions only, while inline AI is
switched on separately by **Inline AI Vault Context**. The four vault-context
settings also join
the settings search index, so they are reachable by name; previously a search for
"similarity threshold" surfaced only the unrelated Semantic setting that shares
that label.

The automatic chat context budget now lets the share-of-window fraction decide
the budget on its own. The Claude, Codex, OpenCode and Pi presets each declare a
200k-token context window, and the ceiling that guards against an implausibly
large window sat below 30% of that, so it clipped all four — two settings
governed one number and the tighter one won silently. Raising the ceiling clear
of that point puts the fraction back in charge and leaves the ceiling doing its
real job for a future million-token window. In practice the retrieval budget a
chat message reports rises from 144,000 to 180,000 characters, so more of the
vault reaches the model per question. An explicit **Chat Context Token Budget**
still overrides automatic sizing, and providers that declare no window — Ollama
among the presets — are unaffected, as are small declared windows.
The four constants behind the derivation are now documented in place, including
an honest note that the two fractions have no recorded derivation.

Similar Notes Limit and Similarity Threshold are also range-checked where they
are consumed, matching their chat-retrieval siblings. The dropdowns cannot
produce an out-of-range value, but a settings import or a plugin write can, and
the failure was silent: a negative threshold quietly returned no similar notes at
all.
