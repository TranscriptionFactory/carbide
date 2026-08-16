import { describe, expect, it } from "vitest";
import { sanitize_ai_output } from "$lib/features/ai/domain/ai_output_sanitizer";

// The sanitizer is the last filter between a chatty model and the note, and it
// has no review step behind it in source mode. Every case that is not an
// unambiguous wrapper must come back byte-for-byte unchanged.

const strips: [name: string, raw: string, expected: string][] = [
  [
    "an announcing preamble ending in a colon",
    "Here is your response:\n\nThe edited passage.",
    "The edited passage.",
  ],
  [
    "a bare conversational opener",
    "Sure!\n\nThe edited passage.",
    "The edited passage.",
  ],
  [
    "a bare conversational opener closed with a period",
    "Of course.\n\nThe edited passage.",
    "The edited passage.",
  ],
  [
    "an opener that continues into an announcement ending in a colon",
    "Sure, here is the rewrite:\n\nThe edited passage.",
    "The edited passage.",
  ],
  [
    "a first-person announcement",
    "I've rewritten the passage:\n\nThe edited passage.",
    "The edited passage.",
  ],
  [
    "a preamble separated by a blank line carrying whitespace",
    "Certainly, here is the rewrite:\n   \nThe edited passage.",
    "The edited passage.",
  ],
  [
    "a bare wrapping fence",
    "```\nThe edited passage.\n```",
    "The edited passage.",
  ],
  [
    "a markdown-tagged wrapping fence",
    "```markdown\n# Title\n\nBody text.\n```",
    "# Title\n\nBody text.",
  ],
  [
    "a tilde wrapping fence",
    "~~~md\nThe edited passage.\n~~~",
    "The edited passage.",
  ],
  [
    "a preamble and a wrapping fence together",
    "Here is the rewrite:\n\n```markdown\nThe edited passage.\n```",
    "The edited passage.",
  ],
  [
    "surrounding whitespace around a wrapping fence",
    "\n```text\nThe edited passage.\n```\n",
    "The edited passage.",
  ],
  [
    "a trailing offer to adjust the output",
    "The edited passage.\n\nLet me know if you'd like me to adjust anything!",
    "The edited passage.",
  ],
  [
    "a trailing offer to expand the output",
    "The edited passage.\n\nWould you like me to expand on any of these sections?",
    "The edited passage.",
  ],
  [
    "a trailing invitation to request changes",
    "The edited passage.\n\nFeel free to ask if you'd like any changes.",
    "The edited passage.",
  ],
  [
    "a trailing first-person offer to tweak the output",
    "The edited passage.\n\nI can tweak the tone if that reads too formal.",
    "The edited passage.",
  ],
  [
    "a trailing offer that opens with a stock sign-off",
    "The edited passage.\n\nHope this helps — happy to revise it further.",
    "The edited passage.",
  ],
  [
    "two stacked closers",
    "The edited passage.\n\nLet me know if you'd like me to adjust anything!\n\nHappy to rewrite it entirely.",
    "The edited passage.",
  ],
  [
    "a closer trailed by blank lines",
    "The edited passage.\n\nLet me know if you'd like me to adjust anything!\n\n",
    "The edited passage.",
  ],
  [
    "a preamble and a closer around the same body",
    "Sure!\n\nThe edited passage.\n\nLet me know if you'd like me to adjust anything!",
    "The edited passage.",
  ],
  [
    "a closer following a wrapping fence",
    "```markdown\nThe edited passage.\n```\n\nLet me know if you'd like me to adjust anything!",
    "The edited passage.",
  ],
];

const preserves: [name: string, raw: string][] = [
  ["plain prose that is the intended output", "The quick brown fox jumps."],
  [
    "prose whose first paragraph merely reads like a preamble",
    "Here is the plan\n\nStep one is to begin.",
  ],
  [
    "a sentence opening with an announcing phrase mid-note",
    "This is the part that matters.\n\nAnd this is the rest.",
  ],
  [
    "content that carries on past a conversational opener",
    "Of course, the reason this matters is that the fox is quick.\n\nMore text.",
  ],
  [
    "a conversational opener leading into content without a colon",
    "Sure, the fox jumps over the lazy dog.\n\nMore text.",
  ],
  ["fenced code that is itself the answer", "```python\nprint(1)\n```"],
  [
    "a fence wrapping other fences",
    "```markdown\nIntro\n\n```js\ncode\n```\n\nOutro\n```",
  ],
  ["an unterminated fence", "```markdown\nThe edited passage."],
  [
    "a fence that is only part of the output",
    "```\ncode\n```\n\nTrailing prose.",
  ],
  ["a heading that reads like a preamble", "# Here is the title:\n\nBody."],
  ["a quoted preamble-shaped line", "> Here is a quote:\n\nBody."],
  ["a list item", "- Here is an item:\n\n- Another item."],
  ["an empty response", ""],
  ["a whitespace-only response", "   \n\n  "],
  ["a preamble with nothing after it", "Sure!\n\n   "],
  ["an empty wrapping fence", "```\n```"],
  [
    "a paragraph too long to be a preamble",
    `Here is ${"a very long announcement ".repeat(12)}:\n\nBody.`,
  ],

  // The last line of a document is the user's own writing far more often than
  // it is model chatter, and the document path returns the whole note. Every
  // case below ends in the punctuation a naive tail rule keys on, so a rule
  // that strips any trailing "?" or "!" fails them.
  [
    "a document that genuinely ends in a question",
    "The lock is held by the old migration.\n\nSo where does that leave the migration?",
  ],
  [
    "a second-person offer that is the user's own prose",
    "Drafted the retro agenda.\n\nLet me know if you'd like to grab coffee after!",
  ],
  [
    "a closer-shaped frame asking about the user's subject matter",
    "Notes from standup.\n\nWould you like me to bring anything to the retro?",
  ],
  [
    "an invitation that offers no revision of the text",
    "Filed the ticket against the platform board.\n\nFeel free to ping the on-call!",
  ],
  [
    "a question about revising something other than this output",
    "The draft is attached.\n\nShould we change the deadline?",
  ],
  [
    "a stock sign-off carrying no offer to revise",
    "The steps are above.\n\nHope this helps!",
  ],
  [
    "a closer-shaped final list item",
    "Options:\n\n- Let me know if you'd like me to adjust anything!",
  ],
  [
    "a closer-shaped line inside a trailing list",
    "Options:\n\n- Ship it\n- Let me know if you'd like me to adjust anything!",
  ],
  [
    "a closer-shaped line inside a trailing table",
    "Owners:\n\n| Task | Note |\n| --- | --- |\n| Ship | let me know if you'd like me to adjust anything |",
  ],
  [
    "a closer-shaped line inside a trailing fenced block",
    "The build step:\n\n```sh\n# let me know if you'd like me to adjust anything\nnpm run build\n```",
  ],
  [
    "a closer-shaped line quoted in a trailing blockquote",
    "They replied:\n\n> Let me know if you'd like me to adjust anything!",
  ],
  // Documents sanitize_ai_output's empty-output fallback — NOT a guard on the
  // trailing rule. Any rule aggressive enough to strip this would leave "",
  // and the fallback returns the input unchanged regardless, so this case
  // cannot fail however over-broad the tail rule becomes. Verified by
  // mutation. Do not read it as evidence the tail rule is narrow.
  [
    "a lone closer, by the empty-output fallback rather than the tail rule",
    "Let me know if you'd like me to adjust anything!",
  ],
];

describe("sanitize_ai_output", () => {
  describe("strips model scaffolding", () => {
    for (const [name, raw, expected] of strips) {
      it(`strips ${name}`, () => {
        expect(sanitize_ai_output(raw)).toBe(expected);
      });
    }
  });

  describe("leaves legitimate output untouched", () => {
    for (const [name, raw] of preserves) {
      it(`preserves ${name}`, () => {
        expect(sanitize_ai_output(raw)).toBe(raw);
      });
    }
  });

  it("never turns non-empty output into nothing", () => {
    for (const [, raw] of preserves) {
      if (raw.trim() === "") continue;
      expect(sanitize_ai_output(raw).trim()).not.toBe("");
    }
  });

  it("is idempotent", () => {
    for (const [, raw] of strips) {
      const once = sanitize_ai_output(raw);
      expect(sanitize_ai_output(once)).toBe(once);
    }
  });
});
