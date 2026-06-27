import { describe, expect, test } from "vitest";
import { is_markdown } from "$lib/features/editor/domain/is_markdown";

describe("is_markdown — signal-count heuristic", () => {
  test("rejects simple one-line prose", () => {
    expect(is_markdown("hello world")).toBe(false);
  });

  test("FR-38: short prose with single-asterisk emphasis is detected", () => {
    expect(is_markdown("Tom's *favorite* movie")).toBe(true);
  });

  test("accepts authored markdown with 3+ signals", () => {
    const md = `# heading\n\n- bullet\n- bullet\n\n[link](url)\n\n\`\`\`\ncode\n\`\`\`\n`;
    expect(is_markdown(md)).toBe(true);
  });

  test("accepts GFM table", () => {
    const md = "| a | b |\n| - | - |\n| 1 | 2 |";
    expect(is_markdown(md)).toBe(true);
  });

  test("accepts fenced code block alone", () => {
    const md = "```typescript\nconst x = 1;\n```";
    expect(is_markdown(md)).toBe(true);
  });

  test("short snippet (<5 lines) accepts at threshold 1", () => {
    expect(is_markdown("- one\n- two\n- three\n- four")).toBe(true);
  });

  test("long prose with no markdown signals is rejected", () => {
    const prose = Array(20)
      .fill("This is plain prose with no markdown signals.")
      .join("\n");
    expect(is_markdown(prose)).toBe(false);
  });

  test("empty string returns false", () => {
    expect(is_markdown("")).toBe(false);
  });

  test("ATX heading counts as one signal", () => {
    expect(is_markdown("# heading")).toBe(true);
  });

  test("math block counts", () => {
    expect(is_markdown("Some text\n$$\n\\frac{a}{b}\n$$")).toBe(true);
  });
});

describe("is_markdown — extended signals (D8 + D18)", () => {
  describe("blockquote signal", () => {
    test("detects a single blockquote line", () => {
      expect(is_markdown("> quoted text")).toBe(true);
    });

    test("detects blockquote inside a multi-line snippet", () => {
      expect(is_markdown("intro\n\n> quoted")).toBe(true);
    });

    test("rejects bare `>` without trailing space (e.g. comparison operator)", () => {
      expect(is_markdown("if (x > y) {")).toBe(false);
    });
  });

  describe("inline code signal", () => {
    test("detects a single backtick-wrapped span", () => {
      expect(is_markdown("use `npm install` to add deps")).toBe(true);
    });

    test("rejects unmatched backticks", () => {
      expect(is_markdown("this has a stray ` backtick")).toBe(false);
    });
  });

  describe("paired emphasis signal", () => {
    test("detects **bold**", () => {
      expect(is_markdown("this is **bold** text")).toBe(true);
    });

    test("detects __underscored bold__", () => {
      expect(is_markdown("this is __bold__ text")).toBe(true);
    });

    test("detects ~~strikethrough~~", () => {
      expect(is_markdown("this is ~~struck~~ text")).toBe(true);
    });

    test("FR-38: single-asterisk emphasis is detected (was: rejected)", () => {
      expect(is_markdown("this has a single *italic* word")).toBe(true);
    });

    test("three styles count as one signal (not three)", () => {
      expect(is_markdown("**a** __b__ ~~c~~")).toBe(true);
    });
  });

  describe("capitalized JSX open tag signal", () => {
    test("detects single-line <Callout> from email/Slack", () => {
      expect(is_markdown('<Callout type="note">body</Callout>')).toBe(true);
    });

    test("detects self-closing capitalized tag", () => {
      expect(is_markdown("<Image/>")).toBe(true);
    });

    test("detects capitalized tag with no attributes", () => {
      expect(is_markdown("<Accordion>x</Accordion>")).toBe(true);
    });

    test("rejects lowercase HTML without attributes (does not match capital re)", () => {
      expect(is_markdown("plain <u> opener only here")).toBe(false);
    });
  });

  describe("lowercase JSX-with-attribute signal", () => {
    test("detects single-line <img src=…/>", () => {
      expect(is_markdown('<img src="x.png" />')).toBe(true);
    });

    test("detects <a href=…>", () => {
      expect(is_markdown('<a href="https://example.com">link</a>')).toBe(true);
    });

    test("rejects bare lowercase tag without attrs (e.g. <p>)", () => {
      expect(is_markdown("<p>")).toBe(false);
    });
  });

  describe("raw-HTML-inline signal (D18)", () => {
    test("detects <u>foo</u>", () => {
      expect(is_markdown("Some <u>foo</u> text")).toBe(true);
    });

    test("detects <mark>...</mark>", () => {
      expect(is_markdown("a <mark>highlighted</mark> word")).toBe(true);
    });

    test("rejects opener-only <u> on same line without closer", () => {
      expect(is_markdown("plain text <u> with opener only")).toBe(false);
    });

    test("rejects opener and closer on different lines", () => {
      expect(is_markdown("<u>\nfoo\n</u>")).toBe(false);
    });
  });

  describe("AI-chat copy-button shape (combined signals)", () => {
    test("blockquote + inline code + paired emphasis triggers the heuristic", () => {
      const ai_chat =
        "> quoted reply\n\nuse `code` here\n\nand **bold** answer\n";
      expect(is_markdown(ai_chat)).toBe(true);
    });
  });

  describe("false-positive guard on prose with incidental signals", () => {
    test("long prose with one accidental `<word>` does not trip", () => {
      const prose = `${Array(20)
        .fill("Plain prose continues without any markdown shape.")
        .join("\n")}\nA stray <thing> appears once.`;
      expect(is_markdown(prose)).toBe(false);
    });

    test("prose with comparison operators stays below threshold", () => {
      const prose = "compare x > y and a < b\n".repeat(10);
      expect(is_markdown(prose)).toBe(false);
    });
  });

  describe("threshold boundary — exact N-1 vs N signal counts", () => {
    test("30-line prose with exactly 2 signals stays below threshold=3", () => {
      const lines = Array(28).fill("Plain prose without markdown shape.");
      const with_two_signals = [
        "> quoted reply",
        ...lines,
        "`code` reference",
      ].join("\n");
      expect(is_markdown(with_two_signals)).toBe(false);
    });

    test("30-line prose with exactly 3 signals hits threshold=3", () => {
      const lines = Array(27).fill("Plain prose without markdown shape.");
      const with_three_signals = [
        "> quoted reply",
        ...lines,
        "`code` reference",
        "and **bold** word",
      ].join("\n");
      expect(is_markdown(with_three_signals)).toBe(true);
    });
  });

  describe("large-payload sampling — head + tail scan above 256KB", () => {
    test("large payload (>256KB) samples head+tail and detects signals in the head", () => {
      const head = "# Heading\n\n- bullet item\n\n```\ncode block\n```\n";
      const filler = "plain prose line without markdown shape\n".repeat(7000);
      expect((head + filler).length).toBeGreaterThan(256 * 1024);
      expect(is_markdown(head + filler)).toBe(true);
    });

    test("large payload with signals only in the middle is not detected (sampling limitation)", () => {
      const head_filler = "plain prose line without markdown shape\n".repeat(
        4000,
      );
      const middle = "# Heading\n- bullet\n```\ncode\n```\n";
      const tail_filler = "plain prose line without markdown shape\n".repeat(
        4000,
      );
      const payload = head_filler + middle + tail_filler;
      expect(payload.length).toBeGreaterThan(256 * 1024);
      expect(is_markdown(payload)).toBe(false);
    });

    test("boundary newline does not synthesize a blockquote false-positive between head and tail", () => {
      const head = `${"a".repeat(32 * 1024 - 1)}>`;
      const tail = ` text${"a".repeat(32 * 1024 - 5)}`;
      const filler = "b".repeat(200 * 1024);
      const payload = head + filler + tail;
      expect(payload.length).toBeGreaterThan(256 * 1024);
      expect(is_markdown(payload)).toBe(false);
    });
  });
});

describe("is_markdown — FR-38 widened signals", () => {
  describe("setext heading (FR-38 SETEXT_RE)", () => {
    test("detects H1 setext (Title\\n=====)", () => {
      expect(is_markdown("Title\n=====")).toBe(true);
    });

    test("detects H2 setext (Subtitle\\n----)", () => {
      expect(is_markdown("Subtitle\n----")).toBe(true);
    });

    test("detects single-char underline (H\\n=)", () => {
      expect(is_markdown("H\n=")).toBe(true);
    });

    test("rejects an underline-shaped line without a preceding content line", () => {
      expect(is_markdown("----")).toBe(false);
    });

    test("rejects prose that contains hyphens but no underline line", () => {
      expect(is_markdown("hello -- world")).toBe(false);
    });
  });

  describe("single-asterisk emphasis (FR-38 SINGLE_STAR_EM_RE)", () => {
    test("detects bare `*emphasis*`", () => {
      expect(is_markdown("*emphasis*")).toBe(true);
    });

    test("detects mid-prose `text *foo* text`", () => {
      expect(is_markdown("text *foo* text")).toBe(true);
    });

    test("matches `**bold**` via the strong signal", () => {
      expect(is_markdown("**bold**")).toBe(true);
    });

    test("rejects mid-word `snake*case*var` (no surrounding whitespace)", () => {
      expect(is_markdown("snake*case*var")).toBe(false);
    });
  });

  describe("single-underscore emphasis (FR-38 SINGLE_UNDER_EM_RE)", () => {
    test("detects bare `_emphasis_`", () => {
      expect(is_markdown("_emphasis_")).toBe(true);
    });

    test("detects mid-prose `text _foo_ text`", () => {
      expect(is_markdown("text _foo_ text")).toBe(true);
    });

    test("detects `__bold__`", () => {
      expect(is_markdown("__bold__")).toBe(true);
    });

    test("rejects mid-identifier `snake_case_var`", () => {
      expect(is_markdown("snake_case_var")).toBe(false);
    });
  });

  describe("tilde fenced code (FR-38 TILDE_FENCE_RE)", () => {
    test("detects `~~~js\\ncode\\n~~~`", () => {
      expect(is_markdown("~~~js\ncode\n~~~")).toBe(true);
    });

    test("detects bare `~~~` opener at line start", () => {
      expect(is_markdown("~~~")).toBe(true);
    });

    test("detects strikethrough `~~strike~~`", () => {
      expect(is_markdown("~~strike~~")).toBe(true);
    });

    test("rejects single tilde `~strike~`", () => {
      expect(is_markdown("~strike~")).toBe(false);
    });
  });

  describe("CommonMark backslash escape (FR-38 BACKSLASH_ESCAPE_RE)", () => {
    test("detects `\\*not emphasis\\*`", () => {
      expect(is_markdown("\\*not emphasis\\*")).toBe(true);
    });

    test("detects `\\_v\\_` (escaped underscore)", () => {
      expect(is_markdown("\\_v\\_")).toBe(true);
    });

    test("detects double-backslash `\\\\foo`", () => {
      expect(is_markdown("\\\\foo")).toBe(true);
    });

    test("detects escaped hash `\\#hashtag`", () => {
      expect(is_markdown("\\#hashtag")).toBe(true);
    });

    test("detects escaped exclamation `\\!`", () => {
      expect(is_markdown("\\!")).toBe(true);
    });

    test("rejects backslash before non-punct char `\\n word`", () => {
      expect(is_markdown("\\n word")).toBe(false);
    });

    test("rejects pure prose with no backslashes", () => {
      expect(is_markdown("hello world")).toBe(false);
    });
  });

  describe("combined FR-38 signals + threshold scaling", () => {
    test("long prose with one accidental `*foo*` is detected (threshold=1 for short input)", () => {
      expect(is_markdown("Tom typed *fancy* in his note")).toBe(true);
    });

    test("long prose without any FR-38 markers stays below threshold", () => {
      const prose = Array(20)
        .fill("Pure prose without any markdown markers.")
        .join("\n");
      expect(is_markdown(prose)).toBe(false);
    });

    test("30-line prose with FR-38 backslash-escape + setext does not over-trip", () => {
      const lines = Array(28).fill("Plain prose without markdown shape.");
      const with_two_signals = [
        "Title",
        "====",
        ...lines,
        "See also \\#tag",
      ].join("\n");
      expect(is_markdown(with_two_signals)).toBe(false);
    });
  });
});
