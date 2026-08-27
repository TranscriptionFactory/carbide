---
"carbide": patch
---

Fix semantic similarity scoring and how those scores are presented.

- Suggested Links no longer labels a smart-link rule score as embedding similarity. The percentage badge now appears only when a cosine similarity actually exists, and ordering uses a separate `rank_score` that can carry the weighted rule composite without pretending to be a cosine. Previously two notes edited the same day that shared a tag rendered as "80% cosine similarity", and a note matching all four default rules rendered as "100% — identical meaning".
- The search graph now honours the Min Semantic Similarity setting instead of a hardcoded distance cutoff.
- `GraphService`'s semantic-edge option is renamed `distance_threshold` → `similarity_threshold`, which is what it always held; the name invited a silent polarity inversion.
- The `same_day` smart-link rule orders its 50-row limit deterministically, so suggestions stop reshuffling between refreshes with no data change.
- Search graph hits show match strength relative to the top hit instead of a raw RRF score, which always read ~0.02 and made the min-score filter unusable.
- The two settings both labelled "Similarity Threshold" — one a distance, one a similarity — are now "Max Context Distance" and "Min Semantic Similarity".
- `similarity_label` clamps negative cosines to 0% rather than rendering "-20%".
