---
"carbide": patch
---

Fix links whose text is inline code, such as [`model-name`](https://…), being replaced by an empty `` on save. The link, its URL, and its text are now kept.
