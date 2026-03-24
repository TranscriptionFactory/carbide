import { describe, it, expect, vi } from "vitest";
import {
  build_file_link,
  create_file_drop_prose_plugin,
} from "$lib/features/editor/domain/file_drop_plugin";
import type { PastedImagePayload } from "$lib/shared/types/editor";

describe("build_file_link", () => {
  describe("non-image files", () => {
    it("builds a markdown link with filename as label", () => {
      const result = build_file_link("docs/report.pdf", "notes/my-note.md");
      expect(result).toBe("[report.pdf](../docs/report.pdf)");
    });

    it("builds a markdown link for a file in the same folder", () => {
      const result = build_file_link("notes/data.csv", "notes/my-note.md");
      expect(result).toBe("[data.csv](data.csv)");
    });

    it("builds a link for a nested file path", () => {
      const result = build_file_link(
        "attachments/2024/slides.pptx",
        "notes/my-note.md",
      );
      expect(result).toBe("[slides.pptx](../attachments/2024/slides.pptx)");
    });

    it("builds a link for a file at root level", () => {
      const result = build_file_link("README.txt", "notes/my-note.md");
      expect(result).toBe("[README.txt](../README.txt)");
    });
  });

  describe("image files", () => {
    it("builds an image link for .png files", () => {
      const result = build_file_link("assets/photo.png", "notes/my-note.md");
      expect(result).toBe("![photo](../assets/photo.png)");
    });

    it("builds an image link for .jpg files", () => {
      const result = build_file_link("images/banner.jpg", "notes/my-note.md");
      expect(result).toBe("![banner](../images/banner.jpg)");
    });

    it("builds an image link for .gif files", () => {
      const result = build_file_link("assets/anim.gif", "notes/my-note.md");
      expect(result).toBe("![anim](../assets/anim.gif)");
    });

    it("builds an image link for .svg files", () => {
      const result = build_file_link("icons/logo.svg", "notes/my-note.md");
      expect(result).toBe("![logo](../icons/logo.svg)");
    });

    it("builds an image link for .webp files", () => {
      const result = build_file_link("media/cover.webp", "notes/my-note.md");
      expect(result).toBe("![cover](../media/cover.webp)");
    });

    it("builds an image link for .jpeg files", () => {
      const result = build_file_link("photos/shot.jpeg", "notes/my-note.md");
      expect(result).toBe("![shot](../photos/shot.jpeg)");
    });

    it("uses filename sans extension as alt text for images", () => {
      const result = build_file_link(
        "assets/my-diagram.png",
        "notes/my-note.md",
      );
      expect(result).toBe("![my-diagram](../assets/my-diagram.png)");
    });
  });

  describe("path handling", () => {
    it("handles note at root with file at root", () => {
      const result = build_file_link("file.pdf", "note.md");
      expect(result).toBe("[file.pdf](file.pdf)");
    });

    it("handles deeply nested note", () => {
      const result = build_file_link("assets/photo.png", "a/b/c/note.md");
      expect(result).toBe("![photo](../../../assets/photo.png)");
    });

    it("uses full filename (with extension) as label for non-images", () => {
      const result = build_file_link("data/analysis.py", "notes/note.md");
      expect(result).toBe("[analysis.py](../data/analysis.py)");
    });
  });
});

function make_mock_file(name: string, size: number, type: string): File {
  const content = new Uint8Array(size).fill(1);
  const file = new File([content], name, { type });
  return file;
}

function make_drop_event(files: File[], extra_mime?: string): DragEvent {
  const data_map = new Map<string, string>();
  if (extra_mime) {
    data_map.set("application/x-carbide-filetree-count", extra_mime);
  }

  const dt = {
    files,
    getData: (key: string) => data_map.get(key) ?? "",
  } as unknown as DataTransfer;

  return {
    dataTransfer: dt,
    preventDefault: vi.fn(),
    clientX: 0,
    clientY: 0,
  } as unknown as DragEvent;
}

function make_editable_view() {
  return {
    props: { editable: () => true },
    state: { doc: { content: { size: 0 } } },
    posAtCoords: () => null,
    dispatch: vi.fn(),
    focus: vi.fn(),
  } as unknown as Parameters<
    ReturnType<typeof create_file_drop_prose_plugin>["props"]["handleDrop"] &
      object
  >[0];
}

describe("create_file_drop_prose_plugin — external file drop", () => {
  it("calls callback for each valid external file", async () => {
    const received: PastedImagePayload[] = [];
    const plugin = create_file_drop_prose_plugin((p) => received.push(p));

    const files = [
      make_mock_file("photo.png", 100, "image/png"),
      make_mock_file("doc.pdf", 200, "application/pdf"),
    ];
    const event = make_drop_event(files);
    const view = make_editable_view();

    const result = plugin.props.handleDrop!.call(
      plugin,
      view,
      event,
      null as never,
      false,
    );
    expect(result).toBe(true);

    await new Promise((r) => setTimeout(r, 0));
    expect(received).toHaveLength(2);
  });

  it("filters out zero-size files", async () => {
    const received: PastedImagePayload[] = [];
    const plugin = create_file_drop_prose_plugin((p) => received.push(p));

    const files = [
      make_mock_file("empty.png", 0, "image/png"),
      make_mock_file("real.png", 50, "image/png"),
    ];
    const event = make_drop_event(files);
    const view = make_editable_view();

    plugin.props.handleDrop!.call(plugin, view, event, null as never, false);
    await new Promise((r) => setTimeout(r, 0));

    expect(received).toHaveLength(1);
    expect(received[0]!.file_name).toBe("real.png");
  });

  it("filters out files without names", async () => {
    const received: PastedImagePayload[] = [];
    const plugin = create_file_drop_prose_plugin((p) => received.push(p));

    const nameless = make_mock_file("", 100, "image/png");
    const named = make_mock_file("ok.jpg", 100, "image/jpeg");
    const event = make_drop_event([nameless, named]);
    const view = make_editable_view();

    plugin.props.handleDrop!.call(plugin, view, event, null as never, false);
    await new Promise((r) => setTimeout(r, 0));

    expect(received).toHaveLength(1);
    expect(received[0]!.file_name).toBe("ok.jpg");
  });

  it("returns false when no callback is provided", () => {
    const plugin = create_file_drop_prose_plugin();
    const files = [make_mock_file("photo.png", 100, "image/png")];
    const event = make_drop_event(files);
    const view = make_editable_view();

    const result = plugin.props.handleDrop!.call(
      plugin,
      view,
      event,
      null as never,
      false,
    );
    expect(result).toBe(false);
  });

  it("returns false when dataTransfer has no files", () => {
    const received: PastedImagePayload[] = [];
    const plugin = create_file_drop_prose_plugin((p) => received.push(p));

    const event = make_drop_event([]);
    const view = make_editable_view();

    const result = plugin.props.handleDrop!.call(
      plugin,
      view,
      event,
      null as never,
      false,
    );
    expect(result).toBe(false);
  });

  it("returns false when drop has carbide custom mime type", () => {
    const received: PastedImagePayload[] = [];
    const plugin = create_file_drop_prose_plugin((p) => received.push(p));

    const files = [make_mock_file("photo.png", 100, "image/png")];
    const event = make_drop_event(files, "1");
    const view = make_editable_view();

    const result = plugin.props.handleDrop!.call(
      plugin,
      view,
      event,
      null as never,
      false,
    );
    expect(result).toBe(false);
  });

  it("callback receives correct PastedImagePayload shape", async () => {
    const received: PastedImagePayload[] = [];
    const plugin = create_file_drop_prose_plugin((p) => received.push(p));

    const files = [make_mock_file("image.webp", 64, "image/webp")];
    const event = make_drop_event(files);
    const view = make_editable_view();

    plugin.props.handleDrop!.call(plugin, view, event, null as never, false);
    await new Promise((r) => setTimeout(r, 0));

    expect(received).toHaveLength(1);
    const payload = received[0]!;
    expect(payload.file_name).toBe("image.webp");
    expect(payload.mime_type).toBe("image/webp");
    expect(payload.bytes).toBeInstanceOf(Uint8Array);
    expect(payload.bytes.length).toBe(64);
  });

  it("falls back to application/octet-stream when mime type is empty", async () => {
    const received: PastedImagePayload[] = [];
    const plugin = create_file_drop_prose_plugin((p) => received.push(p));

    const files = [make_mock_file("data.bin", 32, "")];
    const event = make_drop_event(files);
    const view = make_editable_view();

    plugin.props.handleDrop!.call(plugin, view, event, null as never, false);
    await new Promise((r) => setTimeout(r, 0));

    expect(received[0]!.mime_type).toBe("application/octet-stream");
  });
});
