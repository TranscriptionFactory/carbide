import { describe, it, expect, vi } from "vitest";
import { create_graph_remark_adapter } from "$lib/features/graph/adapters/graph_remark_adapter";
import type { NotesPort } from "$lib/features/note";
import type {
  VaultId,
  NoteId,
  NotePath,
  MarkdownText,
} from "$lib/shared/types/ids";
import type { NoteMeta, NoteDoc } from "$lib/shared/types/note";

function make_meta(path: string, title?: string): NoteMeta {
  return {
    id: path as NoteId,
    path: path as NotePath,
    name: path.split("/").pop()!,
    title: title ?? path.replace(".md", ""),
    blurb: "",
    mtime_ms: 0,
    ctime_ms: 0,
    size_bytes: 0,
    file_type: null,
  };
}

function make_doc(path: string, markdown: string): NoteDoc {
  return {
    meta: make_meta(path),
    markdown: markdown as MarkdownText,
  };
}

function make_notes_port(docs: NoteDoc[]): NotesPort {
  return {
    list_notes: vi.fn().mockResolvedValue(docs.map((d) => d.meta)),
    read_note: vi.fn(),
    list_folders: vi.fn(),
    write_note: vi.fn(),
    write_and_index_note: vi.fn(),
    create_note: vi.fn(),
    create_folder: vi.fn(),
    rename_note: vi.fn(),
    delete_note: vi.fn(),
    rename_folder: vi.fn(),
    delete_folder: vi.fn(),
    list_folder_contents: vi.fn(),
    get_folder_stats: vi.fn(),
    move_items: vi.fn(),
  } as unknown as NotesPort;
}

function make_read_raw(docs: NoteDoc[]) {
  const content_map = new Map<string, string>(
    docs.map((d) => [d.meta.path as string, d.markdown as string]),
  );
  return vi.fn().mockImplementation((_vault_id: VaultId, path: string) => {
    const markdown = content_map.get(path);
    return markdown !== undefined
      ? Promise.resolve(markdown)
      : Promise.reject(new Error("not found"));
  });
}

const VAULT_ID = "v1" as VaultId;

describe("create_graph_remark_adapter", () => {
  it("builds vault graph from wikilinks", async () => {
    const docs = [
      make_doc("a.md", "Link to [[b]]"),
      make_doc("b.md", "Link to [[a]]"),
      make_doc("c.md", "No links"),
    ];
    const port = make_notes_port(docs);
    const read_raw = make_read_raw(docs);

    const adapter = create_graph_remark_adapter(port, read_raw);
    const snapshot = await adapter.load_vault_graph(VAULT_ID);

    expect(snapshot.stats.node_count).toBe(3);
    expect(snapshot.stats.edge_count).toBe(2);
    expect(snapshot.edges).toContainEqual({ source: "a.md", target: "b.md" });
    expect(snapshot.edges).toContainEqual({ source: "b.md", target: "a.md" });
  });

  it("builds neighborhood snapshot", async () => {
    const docs = [
      make_doc("a.md", "Links to [[b]] and [[c]]"),
      make_doc("b.md", "Links back to [[a]]"),
      make_doc("c.md", "No outlinks"),
    ];
    const port = make_notes_port(docs);
    const read_raw = make_read_raw(docs);

    const adapter = create_graph_remark_adapter(port, read_raw);
    const snapshot = await adapter.load_note_neighborhood(VAULT_ID, "a.md");

    expect(snapshot.center.path).toBe("a.md");
    expect(snapshot.outlinks.map((n) => n.path)).toContain("b.md");
    expect(snapshot.outlinks.map((n) => n.path)).toContain("c.md");
    expect(snapshot.backlinks.map((n) => n.path)).toContain("b.md");
    expect(snapshot.stats.outlink_count).toBe(2);
    expect(snapshot.stats.backlink_count).toBe(1);
    expect(snapshot.stats.bidirectional_count).toBe(1);
  });

  it("identifies orphan links", async () => {
    const docs = [make_doc("a.md", "Links to [[nonexistent]]")];
    const port = make_notes_port(docs);
    const read_raw = make_read_raw(docs);

    const adapter = create_graph_remark_adapter(port, read_raw);
    const snapshot = await adapter.load_note_neighborhood(VAULT_ID, "a.md");

    expect(snapshot.orphan_links).toHaveLength(1);
    expect(snapshot.orphan_links[0]!.target_path).toBe("nonexistent");
    expect(snapshot.stats.orphan_count).toBe(1);
  });

  it("resolves wikilinks without .md extension", async () => {
    const docs = [
      make_doc("a.md", "Links to [[b]]"),
      make_doc("b.md", "standalone"),
    ];
    const port = make_notes_port(docs);
    const read_raw = make_read_raw(docs);

    const adapter = create_graph_remark_adapter(port, read_raw);
    const snapshot = await adapter.load_vault_graph(VAULT_ID);

    expect(snapshot.edges).toContainEqual({ source: "a.md", target: "b.md" });
  });

  it("invalidate_cache forces rebuild", async () => {
    const docs = [make_doc("a.md", "Links to [[b]]"), make_doc("b.md", "")];
    const port = make_notes_port(docs);
    const list_notes = vi.mocked(port.list_notes);
    const read_raw = make_read_raw(docs);

    const adapter = create_graph_remark_adapter(port, read_raw);
    await adapter.load_vault_graph(VAULT_ID);
    expect(list_notes).toHaveBeenCalledTimes(1);

    await adapter.load_vault_graph(VAULT_ID);
    expect(list_notes).toHaveBeenCalledTimes(1);

    await adapter.invalidate_cache(VAULT_ID);
    await adapter.load_vault_graph(VAULT_ID);
    expect(list_notes).toHaveBeenCalledTimes(2);
  });

  it("handles markdown links alongside wikilinks", async () => {
    const docs = [
      make_doc("a.md", "See [link](b.md) and [[c]]"),
      make_doc("b.md", ""),
      make_doc("c.md", ""),
    ];
    const port = make_notes_port(docs);
    const read_raw = make_read_raw(docs);

    const adapter = create_graph_remark_adapter(port, read_raw);
    const snapshot = await adapter.load_vault_graph(VAULT_ID);

    expect(snapshot.edges).toContainEqual({ source: "a.md", target: "b.md" });
    expect(snapshot.edges).toContainEqual({ source: "a.md", target: "c.md" });
  });

  it("does not call read_note during graph indexing", async () => {
    const docs = [make_doc("a.md", "Link to [[b]]"), make_doc("b.md", "")];
    const port = make_notes_port(docs);
    const read_note = vi.mocked(port.read_note);
    const read_raw = make_read_raw(docs);

    const adapter = create_graph_remark_adapter(port, read_raw);
    await adapter.load_vault_graph(VAULT_ID);

    expect(read_note).not.toHaveBeenCalled();
    expect(read_raw).toHaveBeenCalledTimes(docs.length);
  });

  it("skips unreadable notes and still returns a partial vault graph", async () => {
    const docs = [
      make_doc("a.md", "Link to [[b]]"),
      make_doc("b.md", "Link to [[a]]"),
      make_doc("c.md", "Link to [[a]]"),
    ];
    const port = make_notes_port(docs);
    const read_raw = vi
      .fn()
      .mockResolvedValueOnce("Link to [[b]]")
      .mockRejectedValueOnce(new Error("decode failed"))
      .mockResolvedValueOnce("Link to [[a]]");

    const adapter = create_graph_remark_adapter(port, read_raw);
    const snapshot = await adapter.load_vault_graph(VAULT_ID);

    expect(snapshot.stats.node_count).toBe(3);
    expect(snapshot.edges).toContainEqual({ source: "a.md", target: "b.md" });
    expect(snapshot.edges).toContainEqual({ source: "c.md", target: "a.md" });
    expect(snapshot.edges).not.toContainEqual({
      source: "b.md",
      target: "a.md",
    });
  });

  it("groups vault graph nodes by their containing folder", async () => {
    const docs = [
      make_doc("projects/alpha.md", ""),
      make_doc("projects/beta.md", ""),
      make_doc("journal/2026/entry.md", ""),
      make_doc("root.md", ""),
    ];
    const port = make_notes_port(docs);
    const read_raw = make_read_raw(docs);

    const adapter = create_graph_remark_adapter(port, read_raw);
    const snapshot = await adapter.load_vault_graph(VAULT_ID);

    const groups = new Map(snapshot.nodes.map((n) => [n.path, n.group]));
    expect(groups.get("projects/alpha.md")).toBe("projects");
    expect(groups.get("projects/beta.md")).toBe("projects");
    expect(groups.get("journal/2026/entry.md")).toBe("journal/2026");
    expect(groups.get("root.md")).toBe("");
  });

  it("carries frontmatter and inline tags onto vault graph nodes", async () => {
    const docs = [
      make_doc("a.md", "---\ntags:\n  - alpha\n  - beta\n---\n\nBody"),
      make_doc("b.md", "Body with #inline and #another tag"),
      make_doc("c.md", "No tags here"),
    ];
    const port = make_notes_port(docs);
    const read_raw = make_read_raw(docs);

    const adapter = create_graph_remark_adapter(port, read_raw);
    const snapshot = await adapter.load_vault_graph(VAULT_ID);

    const tags = new Map(snapshot.nodes.map((n) => [n.path, n.tags]));
    expect(tags.get("a.md")).toEqual(["alpha", "beta"]);
    expect(tags.get("b.md")).toEqual(["inline", "another"]);
    expect(tags.get("c.md")).toEqual([]);
  });

  it("carries note timestamps onto vault graph nodes", async () => {
    const doc = make_doc("a.md", "");
    doc.meta.ctime_ms = 1000;
    doc.meta.mtime_ms = 2000;
    const port = make_notes_port([doc]);
    const read_raw = make_read_raw([doc]);

    const adapter = create_graph_remark_adapter(port, read_raw);
    const snapshot = await adapter.load_vault_graph(VAULT_ID);

    expect(snapshot.nodes[0]?.date_created_ms).toBe(1000);
    expect(snapshot.nodes[0]?.date_modified_ms).toBe(2000);
  });
});
