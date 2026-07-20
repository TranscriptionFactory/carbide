/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from "vitest";
import GitDiffView from "$lib/features/git/ui/git_diff_view.svelte";
import type { GitDiff } from "$lib/features/git/types/git";
import { flushSync, mount, unmount } from "../helpers/svelte_client_runtime";

let cleanup: (() => void) | null = null;

function render(diff: GitDiff | null) {
  const target = document.createElement("div");
  document.body.appendChild(target);
  const app = mount(GitDiffView, { target, props: { diff } });
  flushSync();
  cleanup = () => {
    unmount(app);
    target.remove();
  };
  return target;
}

afterEach(() => {
  cleanup?.();
  cleanup = null;
});

function sample_diff(): GitDiff {
  return {
    additions: 1,
    deletions: 1,
    hunks: [
      {
        header: "@@ -1,3 +1,3 @@",
        lines: [
          {
            type: "deletion",
            content: "old line",
            old_line: 1,
            new_line: null,
          },
          {
            type: "addition",
            content: "new line",
            old_line: null,
            new_line: 1,
          },
          { type: "context", content: "context", old_line: 2, new_line: 2 },
        ],
      },
    ],
  };
}

describe("GitDiffView", () => {
  it('shows "No changes to display" when diff is null', () => {
    const target = render(null);
    expect(target.querySelector(".DiffView--empty")).not.toBeNull();
    expect(target.textContent).toContain("No changes to display");
  });

  it('shows "No changes to display" when the diff has no hunks', () => {
    const target = render({ additions: 0, deletions: 0, hunks: [] });
    expect(target.querySelector(".DiffView--empty")).not.toBeNull();
  });

  it("renders diff lines with their content", () => {
    const target = render(sample_diff());
    const contents = [...target.querySelectorAll(".DiffView__content")].map(
      (el) => el.textContent,
    );
    expect(contents).toEqual(["old line", "new line", "context"]);
  });

  it("applies addition styling to added lines", () => {
    const target = render(sample_diff());
    const added = target.querySelector(".DiffView__line--addition");
    expect(added).not.toBeNull();
    expect(added?.querySelector(".DiffView__content")?.textContent).toBe(
      "new line",
    );
  });

  it("applies deletion styling to removed lines", () => {
    const target = render(sample_diff());
    const removed = target.querySelector(".DiffView__line--deletion");
    expect(removed).not.toBeNull();
    expect(removed?.querySelector(".DiffView__content")?.textContent).toBe(
      "old line",
    );
  });

  it("renders the hunk header", () => {
    const target = render(sample_diff());
    const header = target.querySelector(".DiffView__header");
    expect(header?.textContent).toContain("@@ -1,3 +1,3 @@");
  });

  it("renders old and new line numbers in the gutters", () => {
    const target = render(sample_diff());
    const old_gutters = [
      ...target.querySelectorAll(".DiffView__gutter--old"),
    ].map((el) => el.textContent?.trim());
    const new_gutters = [
      ...target.querySelectorAll(".DiffView__gutter--new"),
    ].map((el) => el.textContent?.trim());
    expect(old_gutters).toEqual(["1", "", "2"]);
    expect(new_gutters).toEqual(["", "1", "2"]);
  });
});
