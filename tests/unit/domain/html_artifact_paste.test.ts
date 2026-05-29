import { describe, expect, it } from "vitest";
import {
  build_clipboard_provenance,
  derive_artifact_filename,
  extract_html_title,
  format_provenance_banner,
  format_timestamp_for_filename,
  join_vault_path,
  parse_provenance,
  provenance_sidecar_path,
  serialize_provenance,
  slugify_for_filename,
} from "$lib/features/document/domain/html_artifact_paste";

describe("html_artifact_paste", () => {
  describe("extract_html_title", () => {
    it("returns text from <title>", () => {
      expect(extract_html_title("<html><title>Dashboard</title></html>")).toBe(
        "Dashboard",
      );
    });

    it("falls back to first <h1>", () => {
      expect(extract_html_title("<body><h1>My Chart</h1></body>")).toBe(
        "My Chart",
      );
    });

    it("decodes HTML entities", () => {
      expect(extract_html_title("<title>Caf&eacute; &amp; Tea</title>")).toBe(
        "Caf&eacute; & Tea",
      );
    });

    it("returns null when no title or h1 present", () => {
      expect(extract_html_title("<div>just text</div>")).toBe(null);
    });

    it("ignores empty <title>", () => {
      expect(extract_html_title("<title>   </title><h1>Real</h1>")).toBe(
        "Real",
      );
    });
  });

  describe("slugify_for_filename", () => {
    it("lowercases and replaces whitespace with hyphens", () => {
      expect(slugify_for_filename("My Chart Title")).toBe("my-chart-title");
    });

    it("strips diacritics", () => {
      expect(slugify_for_filename("Café Crème")).toBe("cafe-creme");
    });

    it("trims leading and trailing hyphens", () => {
      expect(slugify_for_filename("***Hello!!!")).toBe("hello");
    });

    it("truncates to 64 characters", () => {
      const long = "a".repeat(80);
      expect(slugify_for_filename(long).length).toBe(64);
    });
  });

  describe("format_timestamp_for_filename", () => {
    it("produces YYYYMMDD-HHMMSS", () => {
      const stamp = format_timestamp_for_filename(
        new Date("2026-05-29T14:03:07Z"),
      );
      // Local timezone affects output; assert structural shape only.
      expect(stamp).toMatch(/^\d{8}-\d{6}$/);
    });
  });

  describe("derive_artifact_filename", () => {
    it("uses slugged title + timestamp", () => {
      const now = new Date("2026-05-29T12:34:56Z");
      const result = derive_artifact_filename(
        "<title>My Dashboard</title>",
        now,
      );
      expect(result.html_filename).toMatch(/^my-dashboard-\d{8}-\d{6}\.html$/);
      expect(result.meta_filename).toBe(`${result.stem}.html.meta.json`);
    });

    it("falls back to pasted-html stem when no title", () => {
      const now = new Date("2026-05-29T12:34:56Z");
      const result = derive_artifact_filename("<p>no title</p>", now);
      expect(result.html_filename).toMatch(/^pasted-html-\d{8}-\d{6}\.html$/);
    });
  });

  describe("join_vault_path", () => {
    it("joins folder and filename", () => {
      expect(join_vault_path("docs/artifacts", "a.html")).toBe(
        "docs/artifacts/a.html",
      );
    });

    it("returns just the filename for empty folder (vault root)", () => {
      expect(join_vault_path("", "a.html")).toBe("a.html");
    });
  });

  describe("provenance_sidecar_path", () => {
    it("appends .meta.json suffix", () => {
      expect(provenance_sidecar_path("chart.html")).toBe(
        "chart.html.meta.json",
      );
    });
  });

  describe("clipboard provenance round-trip", () => {
    it("serializes and parses round-trip", () => {
      const now = new Date("2026-05-29T12:34:56Z");
      const meta = build_clipboard_provenance(now);
      const json = serialize_provenance(meta);
      const parsed = parse_provenance(json);
      expect(parsed?.source).toBe("clipboard");
      expect(parsed?.pasted_at).toBe("2026-05-29T12:34:56.000Z");
    });

    it("parse_provenance rejects invalid JSON", () => {
      expect(parse_provenance("not-json")).toBe(null);
    });

    it("parse_provenance rejects payload without source", () => {
      expect(parse_provenance('{"pasted_at":"x"}')).toBe(null);
    });

    it("parse_provenance preserves extra fields", () => {
      const parsed = parse_provenance(
        '{"source":"chat","pasted_at":"2026-05-29T00:00:00Z","chat_id":"abc"}',
      );
      expect(parsed?.chat_id).toBe("abc");
    });
  });

  describe("format_provenance_banner", () => {
    it("renders clipboard with date", () => {
      const parsed = parse_provenance(
        '{"source":"clipboard","pasted_at":"2026-05-29T00:00:00Z"}',
      );
      const banner = format_provenance_banner(parsed!);
      expect(banner).toMatch(/^Pasted from clipboard on \d{4}-\d{2}-\d{2}$/);
    });

    it("renders unknown source with date", () => {
      const banner = format_provenance_banner({
        source: "claude",
        pasted_at: "2026-05-29T00:00:00Z",
      });
      expect(banner).toMatch(/^Source: claude · \d{4}-\d{2}-\d{2}$/);
    });

    it("omits date when missing", () => {
      expect(
        format_provenance_banner({ source: "clipboard", pasted_at: "" }),
      ).toBe("Pasted from clipboard");
    });
  });
});
