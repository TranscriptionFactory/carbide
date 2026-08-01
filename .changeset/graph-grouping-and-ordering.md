---
"carbide": minor
---

feat(graph): group the vault graph by tag or connectedness, and order the groups

- **Group by tag** clusters notes by their tags, and **group by degree** clusters them by how connected they are, alongside the existing grouping modes. Both render with the usual group hulls.
- **Order groups** by name, created date, or modified date, so group placement is predictable instead of incidental.
- The chosen grouping and ordering persist across restarts.

High-cardinality tag groups are hashed into the existing tint palette so colours stay stable.
