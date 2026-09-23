/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { create_prosemirror_editor_port } from "$lib/features/editor/adapters/prosemirror_adapter";
import type { EditorSession } from "$lib/features/editor/ports";

// Past the 8000-line large-doc threshold while staying cheap to parse.
const LARGE_MARKDOWN = "line\n".repeat(8_000);

async function start(
  initial_markdown: string,
  spellcheck: boolean,
): Promise<{ session: EditorSession; root: HTMLElement }> {
  const root = document.createElement("div");
  document.body.appendChild(root);
  const session = await create_prosemirror_editor_port().start_session({
    root,
    initial_markdown,
    note_path: "a.md",
    vault_id: null,
    spellcheck,
    events: {
      on_markdown_change: vi.fn(),
      on_dirty_state_change: vi.fn(),
    },
  });
  return { session, root };
}

function spellcheck_attr(root: HTMLElement): string | null {
  return root.querySelector(".ProseMirror")?.getAttribute("spellcheck") ?? null;
}

function open(session: EditorSession, note_path: string, markdown: string) {
  session.open_buffer({
    note_path,
    vault_id: null,
    initial_markdown: markdown,
    restore_policy: "fresh",
  });
}

describe("prosemirror spellcheck gate", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("follows the user setting below the large-doc threshold", async () => {
    const { session, root } = await start("small note\n", true);
    expect(spellcheck_attr(root)).toBe("true");
    session.set_spellcheck?.(false);
    expect(spellcheck_attr(root)).toBe("false");
    session.set_spellcheck?.(true);
    expect(spellcheck_attr(root)).toBe("true");
    session.destroy();
  });

  it("is off for a large note even when the setting is on", async () => {
    const { session, root } = await start(LARGE_MARKDOWN, true);
    expect(spellcheck_attr(root)).toBe("false");
    session.set_spellcheck?.(true);
    expect(spellcheck_attr(root)).toBe("false");
    session.destroy();
  });

  it("re-evaluates when switching between small and large notes", async () => {
    const { session, root } = await start("small note\n", true);
    open(session, "large.md", LARGE_MARKDOWN);
    expect(spellcheck_attr(root)).toBe("false");
    open(session, "small.md", "small again\n");
    expect(spellcheck_attr(root)).toBe("true");
    session.destroy();
  });
});
