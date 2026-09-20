---
"carbide": minor
---

Query sections and headings with the new `sections` query noun.

```
sections named /Meeting/ in "Projects"
sections under "Roadmap/Q4"
sections named "Decision" with #project
```

`sections` returns one row per section instead of one per note: `named` matches
the heading text (text or `/regex/`), `in` restricts to a vault folder, `under`
matches a heading path and everything nested below it, and the note-level
clauses (`with …`) filter the note the section lives in. Section rows read
`note › heading` in the query panel and in ` ```query ` code blocks, and open
the note scrolled to the section's first line.

The query language docs no longer list `folders` and `files` as forms — they
were never accepted by the parser.
