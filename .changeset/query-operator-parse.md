---
"carbide": patch
---

Fix `>=` and `<=` in queries returning nothing, and keep "not" when a clause changes kind

A query written with `>=` or `<=` — from the query builder's operator dropdown,
from the inline suggestions, or typed by hand — quietly matched nothing. The
parser read only the first character of the operator and then swallowed the
leftover `=` into the value, so `with due >= "now()-7d"` was solved as "due is
greater than the text `= "now()-7d"`", which nothing can be. No error was shown;
the result was simply an empty list. Both two-character operators now parse
whole, and every operator the builder offers is covered by a test that runs
builder output through the parser and into the query backend.

In the structured builder, ticking "not" on a clause and then changing that
clause's kind silently cleared the negation. The clause keeps its "not" now.

The form selector at the top of the builder is gone, along with the `folders`
and `files` query forms. Nothing ever read them — all three forms returned
notes — so the selector only ever suggested a choice that did not exist.
Queries starting with `notes`, or with no form word at all, are unaffected.
