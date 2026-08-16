---
"carbide": patch
---

Fix hand-typed queries failing when a comparison operator has no spaces around it

Typing `Notes with due>="now()-7d"` into the omnibar produced a parse error
instead of a result. The parser read the property name as a whitespace-delimited
word, so `due>=` was taken as the whole property name, no operator was found, and
the rest of the line was reported as unexpected text. Adding spaces —
`Notes with due >= "now()-7d"` — worked, which is why the query builder never hit
this: it always emits the spaced form. Only queries typed by hand were affected.

A property name now ends at a comparison operator as well as at whitespace, so
the tight and spaced forms parse to exactly the same query. This covers `=`,
`!=`, `>`, `<`, `>=` and `<=`. The word operator `contains` is unchanged and
still needs surrounding spaces, and a property whose name merely contains the
word — `contains_count` — is not truncated.
