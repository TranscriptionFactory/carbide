---
"carbide": patch
---

Semantic search now embeds each section along with its note's title and the headings above it (`Title › Parent › Section`), and whole-note embeddings lead with the title. Sections that only make sense in context become findable. **Updating triggers a full re-embed on every vault**: stored vectors are wiped on first launch and rebuilt in the background, and semantic results stay partial until that finishes. The stored encoding version is now a fingerprint of every input that shapes a vector (pooling, query prefix, dimensions, token budget, text layout), so a future change to any of them re-embeds automatically instead of relying on a manual version bump. Renaming a note whose title comes from its filename now re-embeds that note under the new title, while notes titled by an H1 and folder renames keep their vectors.
