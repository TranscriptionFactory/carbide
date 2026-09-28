---
"carbide": patch
---

Store separate embedding vectors for every section window so matches near the end of long sections can be retrieved without being diluted by unrelated content. Search and section similarity return each section once using its best window match, and note vectors average all windows. This encoding update triggers a full-vault re-embedding on upgrade.
