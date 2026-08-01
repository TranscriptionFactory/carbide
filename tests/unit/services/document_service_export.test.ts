/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from "vitest";
import { DocumentService, DocumentStore } from "$lib/features/document";
import type { NoteExportPort } from "$lib/features/document";
import { VaultStore } from "$lib/features/vault";
import type { EpubInput } from "$lib/shared/types/epub";
import { create_test_vault } from "../helpers/test_fixtures";

vi.mock("mermaid", () => ({
  default: {
    initialize: vi.fn(),
    parse: vi.fn(() => Promise.resolve(true)),
    render: vi.fn((id: string) =>
      Promise.resolve({ svg: `<svg data-mermaid-id="${id}"></svg>` }),
    ),
  },
}));

const NOTE_MARKDOWN = "# Section\n\nBody with ![pic](.assets/pic.png).";

function create_export_port(save_path: string | null = "/out/My Note.html") {
  return {
    pick_save_path: vi.fn().mockResolvedValue(save_path),
    export_html_to_pdf: vi.fn().mockResolvedValue(undefined),
    write_html: vi.fn().mockResolvedValue(undefined),
    write_epub: vi.fn().mockResolvedValue(undefined),
  } satisfies Record<keyof NoteExportPort, ReturnType<typeof vi.fn>>;
}

function create_service(export_port: ReturnType<typeof create_export_port>) {
  const vault_store = new VaultStore();
  vault_store.vault = create_test_vault();
  return new DocumentService(
    {
      open_buffer: vi.fn(),
      read_buffer_window: vi.fn(),
      close_buffer: vi.fn(),
      resolve_asset_url: vi.fn(() => ""),
      read_file: vi.fn(),
      write_file: vi.fn(),
      delete_file: vi.fn(),
    },
    vault_store,
    new DocumentStore(),
    () => 1_770_000_000_000,
    3,
    export_port,
  );
}

describe("DocumentService HTML export", () => {
  it("writes a standalone document to the chosen path", async () => {
    const export_port = create_export_port();
    const service = create_service(export_port);

    await service.export_note_html("My Note", NOTE_MARKDOWN);

    expect(export_port.pick_save_path).toHaveBeenCalledWith("My Note", "html");
    const [html, path] = export_port.write_html.mock.calls[0] as [
      string,
      string,
    ];
    expect(path).toBe("/out/My Note.html");
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("<title>My Note</title>");
    expect(html).toContain("<h1>Section</h1>");
    expect(html).toContain(".katex");
  });

  it("inlines images through the resolver", async () => {
    const export_port = create_export_port();
    const service = create_service(export_port);

    await service.export_note_html("My Note", NOTE_MARKDOWN, async () =>
      Promise.resolve("data:image/png;base64,AAA"),
    );

    const [html] = export_port.write_html.mock.calls[0] as [string];
    expect(html).toContain('src="data:image/png;base64,AAA"');
  });

  it("writes nothing when the save dialog is cancelled", async () => {
    const export_port = create_export_port(null);
    const service = create_service(export_port);

    await service.export_note_html("My Note", NOTE_MARKDOWN);

    expect(export_port.write_html).not.toHaveBeenCalled();
  });
});

describe("DocumentService EPUB export", () => {
  async function export_epub(
    export_port: ReturnType<typeof create_export_port>,
    markdown = NOTE_MARKDOWN,
  ) {
    const service = create_service(export_port);
    await service.export_note_epub("My Note", markdown, (src) =>
      src.startsWith(".assets/") ? src : null,
    );
    return export_port.write_epub.mock.calls[0] as [string, EpubInput, string];
  }

  it("builds a single-chapter EPUB input for the chosen path", async () => {
    const export_port = create_export_port("/out/My Note.epub");
    const [vault_id, input, path] = await export_epub(export_port);

    expect(export_port.pick_save_path).toHaveBeenCalledWith("My Note", "epub");
    expect(vault_id).toBe("vault-1");
    expect(path).toBe("/out/My Note.epub");
    expect(input.title).toBe("My Note");
    expect(input.source_url).toBeNull();
    expect(input.created_at).toBe(new Date(1_770_000_000_000).toISOString());
  });

  it("emits well-formed XHTML that links the bundled stylesheet", async () => {
    const export_port = create_export_port("/out/My Note.epub");
    const [, input] = await export_epub(export_port);

    const doc = new DOMParser().parseFromString(
      input.xhtml,
      "application/xhtml+xml",
    );
    expect(doc.querySelector("parsererror")).toBeNull();
    expect(doc.getElementsByTagName("title")[0]?.textContent).toBe("My Note");
    expect(doc.getElementsByTagName("link")[0]?.getAttribute("href")).toBe(
      "style.css",
    );
    expect(doc.getElementsByTagName("h1")[0]?.textContent).toBe("My Note");
    expect(input.css).toContain(".katex");
  });

  it("rewrites vault images to EPUB hrefs and lists them as manifest images", async () => {
    const export_port = create_export_port("/out/My Note.epub");
    const [, input] = await export_epub(export_port);

    expect(input.images).toEqual([
      {
        href: "images/img-0.png",
        asset_path: ".assets/pic.png",
        media_type: "image/png",
      },
    ]);
    expect(input.xhtml).toContain("images/img-0.png");
    expect(input.xhtml).not.toContain(".assets/pic.png");
  });

  it("leaves unresolvable images out of the manifest", async () => {
    const export_port = create_export_port("/out/My Note.epub");
    const [, input] = await export_epub(
      export_port,
      "![remote](https://x.test/a.png)",
    );

    expect(input.images).toEqual([]);
    expect(input.xhtml).toContain("image-missing");
  });

  it("writes nothing when the save dialog is cancelled", async () => {
    const export_port = create_export_port(null);
    const service = create_service(export_port);

    await service.export_note_epub("My Note", NOTE_MARKDOWN, () => null);

    expect(export_port.write_epub).not.toHaveBeenCalled();
  });
});

describe("DocumentService PDF export", () => {
  it("still renders through the shared document renderer", async () => {
    const export_port = create_export_port("/out/My Note.pdf");
    const service = create_service(export_port);

    await service.export_note_pdf("My Note", NOTE_MARKDOWN);

    expect(export_port.pick_save_path).toHaveBeenCalledWith("My Note", "pdf");
    const [html, path] = export_port.export_html_to_pdf.mock.calls[0] as [
      string,
      string,
    ];
    expect(path).toBe("/out/My Note.pdf");
    expect(html.startsWith("<!doctype html>")).toBe(true);
  });
});
