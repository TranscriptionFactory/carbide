/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from "vitest";
import { ClipService } from "$lib/features/clip";
import { to_xhtml_document } from "$lib/features/clip/application/clip_service";
import type { ClipPort } from "$lib/features/clip";
import type { AssetsPort, NoteService } from "$lib/features/note";
import { NotesStore } from "$lib/features/note";
import type { DocumentService } from "$lib/features/document";
import { VaultStore } from "$lib/features/vault";
import { OpStore } from "$lib/app/orchestration/op_store.svelte";
import { create_test_note, create_test_vault } from "../helpers/test_fixtures";

const FINAL_URL = "https://example.com/post";

const LONG_PARAGRAPH =
  "The quick brown fox jumps over the lazy dog and keeps running through the forest, past the river, beyond the hills, into the long evening light where nothing much happens except more words accumulating to satisfy readability's content threshold. ".repeat(
    5,
  );

const PAGE_HTML = `<!doctype html><html><head><title>Test Article</title></head>
<body><article><h1>Test Article</h1>
<p>${LONG_PARAGRAPH}</p>
<p>${LONG_PARAGRAPH}</p>
<img src="/images/figure.png" alt="figure">
</article></body></html>`;

function create_harness() {
  const clip_port = {
    fetch_page: vi.fn().mockResolvedValue({
      final_url: FINAL_URL,
      html: PAGE_HTML,
      content_type: "text/html",
    }),
    fetch_asset: vi.fn().mockResolvedValue({
      bytes: new Uint8Array([1, 2, 3]),
      content_type: "image/png",
    }),
    write_epub: vi.fn().mockResolvedValue(undefined),
  };
  const assets_port = {
    write_image_asset: vi.fn().mockResolvedValue(".assets/figure-123.png"),
  };
  const note_service = {
    import_markdown_file: vi
      .fn()
      .mockResolvedValue({ status: "created", meta: {} }),
  };
  const document_service = {
    save_html_artifact: vi.fn().mockResolvedValue({
      html_path: "clips/test-article-20260720.html",
      meta_path: "clips/test-article-20260720.html.meta.json",
    }),
  };
  const vault_store = new VaultStore();
  vault_store.vault = create_test_vault();
  const notes_store = new NotesStore();
  const op_store = new OpStore();
  const service = new ClipService(
    clip_port as unknown as ClipPort,
    assets_port as unknown as AssetsPort,
    note_service as unknown as NoteService,
    document_service as unknown as DocumentService,
    vault_store,
    notes_store,
    op_store,
    () => new Date("2026-07-20T12:00:00.000Z").getTime(),
  );
  return {
    clip_port,
    assets_port,
    note_service,
    document_service,
    vault_store,
    notes_store,
    op_store,
    service,
  };
}

const MARKDOWN_ONLY = { markdown: true, html: false, epub: false };
const ALL_FORMATS = { markdown: true, html: true, epub: true };

describe("ClipService.clip_page", () => {
  it("clips a page into a markdown note with localized images", async () => {
    const harness = create_harness();
    const result = await harness.service.clip_page({
      url: FINAL_URL,
      folder_path: "clips",
      formats: MARKDOWN_ONLY,
      attachment_folder: ".assets",
    });

    expect(result.status).toBe("clipped");
    if (result.status !== "clipped") return;
    expect(result.primary.kind).toBe("markdown");
    expect(result.primary.path).toBe("clips/test-article.md");
    expect(result.images_total).toBe(1);
    expect(result.images_failed).toBe(0);

    expect(harness.clip_port.fetch_asset).toHaveBeenCalledWith(
      "https://example.com/images/figure.png",
    );
    const [note_path, markdown] = harness.note_service.import_markdown_file.mock
      .calls[0] as [string, string];
    expect(note_path).toBe("clips/test-article.md");
    expect(markdown).toContain("source: https://example.com/post");
    expect(markdown).toContain("../.assets/figure-123.png");
    expect(markdown).not.toContain("https://example.com/images/figure.png");
  });

  it("fetches the page once when emitting all three formats", async () => {
    const harness = create_harness();
    const result = await harness.service.clip_page({
      url: FINAL_URL,
      folder_path: "clips",
      formats: ALL_FORMATS,
      attachment_folder: ".assets",
    });

    expect(result.status).toBe("clipped");
    if (result.status !== "clipped") return;
    expect(harness.clip_port.fetch_page).toHaveBeenCalledTimes(1);
    expect(harness.clip_port.fetch_asset).toHaveBeenCalledTimes(1);
    expect(result.outputs.map((output) => output.kind)).toEqual([
      "markdown",
      "html",
      "epub",
    ]);
    expect(result.primary.kind).toBe("markdown");

    const artifact_args = harness.document_service.save_html_artifact.mock
      .calls[0] as unknown[];
    expect(artifact_args[0]).toBe("clips");
    expect(artifact_args[3]).toMatchObject({ source: FINAL_URL });

    const [vault_id, epub_path, epub_input] = harness.clip_port.write_epub.mock
      .calls[0] as [string, string, { xhtml: string; images: unknown[] }];
    expect(vault_id).toBe(harness.vault_store.vault?.id);
    expect(epub_path).toBe("clips/test-article.epub");
    expect(epub_input.images).toEqual([
      {
        href: "images/img-0.png",
        asset_path: ".assets/figure-123.png",
        media_type: "image/png",
      },
    ]);
    expect(epub_input.xhtml).toContain("images/img-0.png");
  });

  it("keeps the remote url and counts failures when an image fetch fails", async () => {
    const harness = create_harness();
    harness.clip_port.fetch_asset.mockRejectedValue(new Error("boom"));

    const result = await harness.service.clip_page({
      url: FINAL_URL,
      folder_path: "",
      formats: MARKDOWN_ONLY,
      attachment_folder: ".assets",
    });

    expect(result.status).toBe("clipped");
    if (result.status !== "clipped") return;
    expect(result.images_failed).toBe(1);
    expect(result.images_total).toBe(1);
    const [, markdown] = harness.note_service.import_markdown_file.mock
      .calls[0] as [string, string];
    expect(markdown).toContain("https://example.com/images/figure.png");
  });

  it("emits only the epub when it is the sole selected format", async () => {
    const harness = create_harness();
    const result = await harness.service.clip_page({
      url: FINAL_URL,
      folder_path: "",
      formats: { markdown: false, html: false, epub: true },
      attachment_folder: ".assets",
    });

    expect(result.status).toBe("clipped");
    if (result.status !== "clipped") return;
    expect(result.primary.kind).toBe("epub");
    expect(harness.note_service.import_markdown_file).not.toHaveBeenCalled();
    expect(harness.document_service.save_html_artifact).not.toHaveBeenCalled();
  });

  it("uniquifies the note path on title collision", async () => {
    const harness = create_harness();
    harness.notes_store.set_notes([
      create_test_note("clips/test-article", "Test Article"),
    ]);

    await harness.service.clip_page({
      url: FINAL_URL,
      folder_path: "clips",
      formats: MARKDOWN_ONLY,
      attachment_folder: ".assets",
    });

    const [note_path] = harness.note_service.import_markdown_file.mock
      .calls[0] as [string];
    expect(note_path).toBe("clips/test-article-2.md");
  });

  it("uses a custom name for the note filename and title", async () => {
    const harness = create_harness();

    await harness.service.clip_page({
      url: FINAL_URL,
      folder_path: "clips",
      formats: MARKDOWN_ONLY,
      attachment_folder: ".assets",
      name: "  My Custom Name  ",
    });

    const [note_path, markdown] = harness.note_service.import_markdown_file.mock
      .calls[0] as [string, string];
    expect(note_path).toBe("clips/my-custom-name.md");
    expect(markdown).toContain('title: "My Custom Name"');
  });

  it("falls back to the page title when the custom name is blank", async () => {
    const harness = create_harness();

    await harness.service.clip_page({
      url: FINAL_URL,
      folder_path: "clips",
      formats: MARKDOWN_ONLY,
      attachment_folder: ".assets",
      name: "   ",
    });

    const [note_path] = harness.note_service.import_markdown_file.mock
      .calls[0] as [string];
    expect(note_path).toBe("clips/test-article.md");
  });

  it("skips when no vault is open", async () => {
    const harness = create_harness();
    harness.vault_store.vault = null;

    const result = await harness.service.clip_page({
      url: FINAL_URL,
      folder_path: "",
      formats: MARKDOWN_ONLY,
      attachment_folder: ".assets",
    });

    expect(result).toEqual({ status: "skipped" });
    expect(harness.clip_port.fetch_page).not.toHaveBeenCalled();
  });

  it("fails without creating outputs when the page fetch fails", async () => {
    const harness = create_harness();
    harness.clip_port.fetch_page.mockRejectedValue(
      new Error("Request to private IP 10.0.0.1 is blocked"),
    );

    const result = await harness.service.clip_page({
      url: "https://evil.example.com/",
      folder_path: "",
      formats: ALL_FORMATS,
      attachment_folder: ".assets",
    });

    expect(result.status).toBe("failed");
    if (result.status !== "failed") return;
    expect(result.error).toContain("private IP");
    expect(harness.note_service.import_markdown_file).not.toHaveBeenCalled();
    expect(harness.document_service.save_html_artifact).not.toHaveBeenCalled();
    expect(harness.clip_port.write_epub).not.toHaveBeenCalled();
    expect(harness.op_store.is_pending("clip.page")).toBe(false);
  });
});

describe("to_xhtml_document", () => {
  it("produces well-formed XHTML from messy HTML content", () => {
    const xhtml = to_xhtml_document(
      "Tricky & <Title>",
      '<p>Fish & chips <img src="a.png" alt="a"><input disabled></p>',
    );
    const reparsed = new DOMParser().parseFromString(
      xhtml,
      "application/xhtml+xml",
    );
    expect(reparsed.querySelector("parsererror")).toBeNull();
    expect(reparsed.getElementsByTagName("title")[0]?.textContent).toBe(
      "Tricky & <Title>",
    );
    expect(reparsed.getElementsByTagName("img")).toHaveLength(1);
  });
});
