import { describe, expect, test } from "vitest";
import { detect_clipboard_source } from "$lib/features/editor/domain/detect_clipboard_source";

function fake_dt(data: Record<string, string>): DataTransfer {
  return {
    types: Object.keys(data),
    getData: (key: string) => data[key] ?? "",
  } as unknown as DataTransfer;
}

describe("detect_clipboard_source", () => {
  test("vscode-editor-data wins over all other MIMEs", () => {
    const dt = fake_dt({
      "vscode-editor-data": '{"mode":"ts"}',
      "text/plain": "code",
      "text/html": "<p>code</p>",
    });
    expect(detect_clipboard_source(dt)).toBe("vscode");
  });

  test("text/x-gfm comes next", () => {
    const dt = fake_dt({
      "text/x-gfm": "# md",
      "text/html": "<h1>md</h1>",
    });
    expect(detect_clipboard_source(dt)).toBe("gfm");
  });

  test("data-pm-slice fingerprint", () => {
    const dt = fake_dt({
      "text/html": '<div data-pm-slice="0 0 doc">hi</div>',
    });
    expect(detect_clipboard_source(dt)).toBe("pm-origin");
  });

  test("gdocs fingerprint", () => {
    const dt = fake_dt({
      "text/html": '<b id="docs-internal-guid-abc">...</b>',
    });
    expect(detect_clipboard_source(dt)).toBe("gdocs");
  });

  test("word fingerprint", () => {
    const dt = fake_dt({
      "text/html":
        '<html xmlns:o="urn:schemas-microsoft-com:office:office">...</html>',
    });
    expect(detect_clipboard_source(dt)).toBe("word");
  });

  test("gmail fingerprint", () => {
    const dt = fake_dt({
      "text/html": '<div class="gmail_default">...</div>',
    });
    expect(detect_clipboard_source(dt)).toBe("gmail");
  });

  test("notion fingerprint", () => {
    const dt = fake_dt({
      "text/html": "<!-- notionvc: abc --><p>hi</p>",
    });
    expect(detect_clipboard_source(dt)).toBe("notion");
  });

  test("apple cocoa fingerprint", () => {
    const dt = fake_dt({
      "text/html":
        '<meta name="Generator" content="Cocoa HTML Writer"><p>hi</p>',
    });
    expect(detect_clipboard_source(dt)).toBe("apple");
  });

  test("slack fingerprint", () => {
    const dt = fake_dt({
      "text/html": '<div class="c-message_kit__gutter">...</div>',
    });
    expect(detect_clipboard_source(dt)).toBe("slack");
  });

  test("gsheets fingerprint", () => {
    const dt = fake_dt({
      "text/html":
        "<google-sheets-html-origin><table>...</table></google-sheets-html-origin>",
    });
    expect(detect_clipboard_source(dt)).toBe("gsheets");
  });

  test("github fingerprint", () => {
    const dt = fake_dt({
      "text/html": '<a data-hovercard-type="commit" href="/x">abc</a>',
    });
    expect(detect_clipboard_source(dt)).toBe("github");
  });

  test("generic HTML with no fingerprint", () => {
    const dt = fake_dt({
      "text/html": "<p>anything</p>",
    });
    expect(detect_clipboard_source(dt)).toBe("generic");
  });

  test("text/plain only → plaintext", () => {
    const dt = fake_dt({ "text/plain": "just text" });
    expect(detect_clipboard_source(dt)).toBe("plaintext");
  });

  test("null DataTransfer → plaintext", () => {
    expect(detect_clipboard_source(null)).toBe("plaintext");
  });
});
