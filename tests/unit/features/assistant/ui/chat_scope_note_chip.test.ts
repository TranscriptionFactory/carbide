/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  flushSync,
  mount,
  unmount,
} from "../../../helpers/svelte_client_runtime";
import ChatScopeBar from "$lib/features/assistant/ui/chat_scope_bar.svelte";
import type { AssistantScope } from "$lib/features/assistant/types/session";

const NOTE = "projects/Hybrid Retrieval.md";
const OTHER_NOTE = "archive/Old Notes.md";

type MountedApp = ReturnType<typeof mount>;
let mounted: Array<{ app: MountedApp; target: HTMLElement }> = [];

function render_bar(props?: {
  scope?: AssistantScope;
  active_note_path?: string | null;
  on_scope_change?: (scope: AssistantScope) => void;
}) {
  const target = document.createElement("div");
  document.body.appendChild(target);
  const app = mount(ChatScopeBar, {
    target,
    props: {
      scope: props?.scope ?? {},
      folder_paths: [],
      tags: [],
      saved_views: [],
      active_note_path:
        props?.active_note_path === undefined ? NOTE : props.active_note_path,
      on_scope_change: props?.on_scope_change ?? vi.fn(),
    },
  });
  mounted.push({ app, target });
  flushSync();
  return target;
}

function this_note_button(target: HTMLElement): HTMLButtonElement | null {
  return target.querySelector<HTMLButtonElement>(
    '[data-testid="scope-this-note"]',
  );
}

function chip_labels(target: HTMLElement): string[] {
  return [...target.querySelectorAll(".ScopeBar__chip-label")].map(
    (el) => el.textContent?.trim() ?? "",
  );
}

afterEach(() => {
  for (const { app, target } of mounted) {
    void unmount(app);
    target.remove();
  }
  mounted = [];
});

describe("chat scope bar — the note chip", () => {
  it("offers the affordance but disables it when no note is open", () => {
    const target = render_bar({ active_note_path: null });
    const button = this_note_button(target);

    expect(button).not.toBeNull();
    expect(button?.disabled).toBe(true);
    expect(button?.getAttribute("title")).toBe(
      "Open a note to scope the chat to it",
    );
  });

  // Goes through the shadcn Button rather than a hand-rolled `all: unset`
  // control, which drops the focus ring and leaves keyboard users with no
  // visible indicator on the affordance.
  it("carries a visible focus indicator", () => {
    const target = render_bar();

    expect(this_note_button(target)?.className).toContain(
      "focus-visible:ring-",
    );
  });

  it("does not narrow the scope when clicked with no note open", () => {
    const on_scope_change = vi.fn();
    const target = render_bar({ active_note_path: null, on_scope_change });

    this_note_button(target)?.click();
    flushSync();

    expect(on_scope_change).not.toHaveBeenCalled();
  });

  it("snapshots the active note path into the scope when armed", () => {
    const on_scope_change = vi.fn();
    const target = render_bar({ on_scope_change });

    this_note_button(target)?.click();
    flushSync();

    expect(on_scope_change).toHaveBeenCalledWith({ notes: [NOTE] });
  });

  it("keeps the other scope dimensions when armed", () => {
    const on_scope_change = vi.fn();
    const target = render_bar({
      scope: { folders: ["projects/"], tags: ["ml"] },
      on_scope_change,
    });

    this_note_button(target)?.click();
    flushSync();

    expect(on_scope_change).toHaveBeenCalledWith({
      folders: ["projects/"],
      tags: ["ml"],
      notes: [NOTE],
    });
  });

  it("reads 'This note' while the scoped note is still the active note", () => {
    const target = render_bar({ scope: { notes: [NOTE] } });

    expect(chip_labels(target)).toContain("This note");
    expect(this_note_button(target)).toBeNull();
  });

  // The scope is a snapshot, not a live binding: a persisted session must not
  // silently restate what its past turns searched. The chip therefore renames
  // rather than retargets, so it never claims a scope it is not applying.
  it("renames to the note's own title once the user navigates away", () => {
    const target = render_bar({
      scope: { notes: [NOTE] },
      active_note_path: OTHER_NOTE,
    });

    expect(chip_labels(target)).toContain("Hybrid Retrieval");
    expect(chip_labels(target)).not.toContain("This note");
  });

  it("re-offers the affordance after navigating, and re-arming retargets", () => {
    const on_scope_change = vi.fn();
    const target = render_bar({
      scope: { notes: [NOTE] },
      active_note_path: OTHER_NOTE,
      on_scope_change,
    });

    const button = this_note_button(target);
    expect(button?.disabled).toBe(false);

    button?.click();
    flushSync();

    expect(on_scope_change).toHaveBeenCalledWith({ notes: [OTHER_NOTE] });
  });

  it("leaves an existing note scope alone when no note is open", () => {
    const target = render_bar({
      scope: { notes: [NOTE] },
      active_note_path: null,
    });

    expect(chip_labels(target)).toContain("Hybrid Retrieval");
    expect(this_note_button(target)?.disabled).toBe(true);
  });

  it("clears the note scope when the chip is dismissed", () => {
    const on_scope_change = vi.fn();
    const target = render_bar({ scope: { notes: [NOTE] }, on_scope_change });

    target.querySelector<HTMLButtonElement>(".ScopeBar__chip-remove")?.click();
    flushSync();

    expect(on_scope_change).toHaveBeenCalledWith({ notes: [] });
  });

  it("renders the note chip alongside the other dimensions", () => {
    const target = render_bar({
      scope: { notes: [NOTE], folders: ["projects/"], tags: ["ml"] },
    });

    expect(chip_labels(target)).toEqual(["This note", "projects/", "#ml"]);
  });
});
