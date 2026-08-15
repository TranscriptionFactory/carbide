---
"carbide": patch
---

Remove a callout from its own menu, and turn a whole callout into something else

Getting rid of a callout used to require knowing an undocumented gesture: put
the caret at the very start of the title and press Backspace. Nothing in the
interface said so, and there was no menu item, command or shortcut for it.
Callouts now carry a "Remove callout" button in the menu behind the callout
icon, next to the Collapsible toggle. It lifts the callout's content out in
place — the title becomes an ordinary paragraph and every block in the body
stays exactly as it was. The Backspace gesture still works and now produces an
identical result, because both go through the same operation.

Turn Into on a callout was also wrong, in two different directions depending on
how you had selected it. With a single callout selected, only the one paragraph
holding the caret converted and the callout itself survived — so "Turn Into →
Heading 2" on a callout appeared to do almost nothing. With two or more blocks
selected, the opposite happened: the entire callout, title and body together,
was flattened into a single heading and the internal structure was lost.

Both now do the same, sensible thing. A callout turned into Heading 2 becomes
that heading from its title, followed by its body blocks as paragraphs:

```
> [!note] Alpha              ## Alpha
> Bravo          becomes
> Charlie                    Bravo

                             Charlie
```

Paragraph, Bullet List, Ordered List and Todo List follow the same rule, one
target block per block inside the callout, and single-block and multi-block
selections now agree for all of them. Collapsible sections behave the same way
as callouts. This matches what Turn Into already did for blockquotes and lists,
whose behaviour is unchanged.

Turn Into in the right-click menu now also targets the block you right-clicked,
the way Copy, Duplicate, Insert and Delete already did, instead of whichever
block happened to hold the text cursor.
