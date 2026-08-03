import { describe, expect, it } from "vitest";
import {
  ATTACHMENT_MAX_CHARS,
  attachment_label,
  build_document_attachment,
} from "$lib/features/assistant";

const TARGET = {
  path: "artifacts/report.html",
  title: "report",
  content: "<h1>Report</h1>",
};

describe("build_document_attachment", () => {
  it("attaches path and title, never content — content resolves fresh at submit", () => {
    const result = build_document_attachment(TARGET);

    expect(result).toEqual({
      status: "attached",
      attachment: { path: "artifacts/report.html", title: "report" },
    });
  });

  it("accepts content exactly at the cap", () => {
    const result = build_document_attachment({
      ...TARGET,
      content: "x".repeat(ATTACHMENT_MAX_CHARS),
    });

    expect(result.status).toBe("attached");
  });

  it("REFUSES an oversized document rather than truncating it", () => {
    const result = build_document_attachment({
      ...TARGET,
      content: "x".repeat(ATTACHMENT_MAX_CHARS + 1),
    });

    expect(result).toEqual({
      status: "too_large",
      chars: ATTACHMENT_MAX_CHARS + 1,
      max: ATTACHMENT_MAX_CHARS,
    });
  });
});

describe("attachment_label", () => {
  it("names the document while its tab is open", () => {
    expect(attachment_label({ path: "a.html", title: "a" }, true)).toBe("a");
  });

  it("marks the chip (closed) when the tab is gone", () => {
    expect(attachment_label({ path: "a.html", title: "a" }, false)).toBe(
      "a (closed)",
    );
  });
});
