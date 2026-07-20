/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import PathBreadcrumb from "$lib/features/folder/ui/path_breadcrumb.svelte";
import { flushSync, mount, unmount } from "../helpers/svelte_client_runtime";

type Props = {
  note_path: string | null;
  note_title: string | null;
  vault_name: string | null;
  on_select_folder: (folder_path: string) => void;
  on_reveal_note: (note_path: string) => void;
};

function render_breadcrumb(overrides: Partial<Props> = {}) {
  const props: Props = {
    note_path: "a/b/c.md",
    note_title: null,
    vault_name: "My Vault",
    on_select_folder: vi.fn(),
    on_reveal_note: vi.fn(),
    ...overrides,
  };
  const target = document.createElement("div");
  document.body.appendChild(target);
  const app = mount(PathBreadcrumb, { target, props });
  flushSync();
  return {
    target,
    props,
    cleanup() {
      unmount(app);
      target.remove();
      flushSync();
    },
  };
}

function segments(target: Element): HTMLButtonElement[] {
  return [
    ...target.querySelectorAll<HTMLButtonElement>(
      '[data-testid="breadcrumb-segment"]',
    ),
  ];
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("path_breadcrumb segments", () => {
  it("renders root, folders, and note with segment kinds", () => {
    const { target, cleanup } = render_breadcrumb();
    const segs = segments(target);
    expect(segs.map((s) => s.textContent?.trim())).toEqual([
      "My Vault",
      "a",
      "b",
      "c",
    ]);
    expect(segs.map((s) => s.dataset.segmentKind)).toEqual([
      "root",
      "folder",
      "folder",
      "note",
    ]);
    cleanup();
  });

  it("falls back to Vault for the root label", () => {
    const { target, cleanup } = render_breadcrumb({ vault_name: null });
    expect(segments(target)[0]?.textContent?.trim()).toBe("Vault");
    cleanup();
  });

  it("reveals the note on note-segment click", () => {
    const { target, props, cleanup } = render_breadcrumb();
    segments(target)
      .find((s) => s.dataset.segmentKind === "note")!
      .click();
    flushSync();
    expect(props.on_reveal_note).toHaveBeenCalledWith("a/b/c.md");
    cleanup();
  });

  it("selects the folder path on folder-segment click", () => {
    const { target, props, cleanup } = render_breadcrumb();
    segments(target)
      .filter((s) => s.dataset.segmentKind === "folder")[1]!
      .click();
    flushSync();
    expect(props.on_select_folder).toHaveBeenCalledWith("a/b");
    cleanup();
  });

  it("renders nothing without a note path", () => {
    const { target, cleanup } = render_breadcrumb({ note_path: null });
    expect(target.querySelector('[data-testid="breadcrumb"]')).toBeNull();
    cleanup();
  });
});
