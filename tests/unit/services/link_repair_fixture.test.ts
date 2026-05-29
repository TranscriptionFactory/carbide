import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { LinkRepairService } from "$lib/features/links/application/link_repair_service";
import { EditorStore } from "$lib/features/editor/state/editor_store.svelte";
import { TabStore } from "$lib/features/tab/state/tab_store.svelte";
import { as_markdown_text, as_note_path } from "$lib/shared/types/ids";
import { create_test_vault } from "../helpers/test_fixtures";
import {
  create_mock_index_port,
  create_mock_notes_port,
} from "../helpers/mock_ports";
import type { SearchPort } from "$lib/features/search/ports";

type FixtureCase = {
  name: string;
  description: string;
  old_source_path: string;
  new_source_path: string;
  target_map: Record<string, string>;
  input_markdown: string;
  expected_markdown: string;
  expected_changed: boolean;
};

type Fixture = {
  cases: FixtureCase[];
};

function load_fixture(): Fixture {
  const path = resolve(process.cwd(), "tests/fixtures/link_repair_cases.json");
  const raw = readFileSync(path, "utf-8");
  return JSON.parse(raw);
}

describe("link_repair shared fixture", () => {
  it("is well-formed and has cases", () => {
    const fixture = load_fixture();
    expect(fixture.cases.length).toBeGreaterThan(0);
    for (const c of fixture.cases) {
      expect(c.name).toBeTruthy();
      expect(typeof c.input_markdown).toBe("string");
      expect(typeof c.expected_markdown).toBe("string");
      expect(typeof c.expected_changed).toBe("boolean");
      expect(c.target_map).toBeTypeOf("object");
    }
  });

  it("flows through LinkRepairService end-to-end for every case", async () => {
    const fixture = load_fixture();
    const vault = create_test_vault();

    for (const c of fixture.cases) {
      if (Object.keys(c.target_map).length === 0) continue;

      const editor_store = new EditorStore();
      const tab_store = new TabStore();
      const notes_port = create_mock_notes_port();
      const index_port = create_mock_index_port();

      const SOURCE_PATH = c.old_source_path;
      const path_map = new Map(Object.entries(c.target_map));

      notes_port.read_note = vi.fn().mockImplementation(() =>
        Promise.resolve({
          meta: {
            id: as_note_path(SOURCE_PATH),
            path: as_note_path(SOURCE_PATH),
            name: SOURCE_PATH,
            title: SOURCE_PATH,
            blurb: "",
            mtime_ms: 0,
            ctime_ms: 0,
            size_bytes: 0,
            file_type: null,
          },
          markdown: as_markdown_text(c.input_markdown),
        }),
      );

      const rewrite_note_links = vi
        .fn()
        .mockImplementation((markdown: string, _o: string, _n: string) => {
          if (markdown === c.input_markdown) {
            return Promise.resolve({
              markdown: c.expected_markdown,
              changed: c.expected_changed,
            });
          }
          return Promise.resolve({ markdown, changed: false });
        });

      const search_port = {
        search_notes: vi.fn(),
        suggest_wiki_links: vi.fn(),
        suggest_planned_links: vi.fn(),
        get_note_links_snapshot: vi.fn().mockResolvedValue({
          backlinks: [{ path: SOURCE_PATH }],
          outlinks: [],
          orphan_links: [],
        }),
        extract_local_note_links: vi.fn(),
        rewrite_note_links,
        resolve_note_link: vi.fn().mockResolvedValue(null),
      } as unknown as SearchPort;

      const service = new LinkRepairService(
        notes_port,
        search_port,
        index_port,
        editor_store,
        tab_store,
        () => 1,
      );

      await service.repair_links(vault.id, path_map);

      if (c.expected_changed) {
        const writes = notes_port._calls.write_note;
        const has_expected_write = writes.some(
          (w) => w.markdown === as_markdown_text(c.expected_markdown),
        );
        expect(has_expected_write, `case '${c.name}': expected write`).toBe(
          true,
        );
      }
    }
  });
});
