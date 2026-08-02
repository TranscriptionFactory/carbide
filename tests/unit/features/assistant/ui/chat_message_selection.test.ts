/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "$lib/app/context/app_context.svelte",
  async () => import("../../../helpers/mock_app_context"),
);

import RagMessageView from "$lib/features/assistant/ui/chat_message.svelte";
import type { AssistantMessage } from "$lib/features/assistant";
import { render_with_app_context } from "../../../helpers/render_with_app_context";
import type { AppContext } from "$lib/app/di/create_app_context";

let cleanups: Array<() => void> = [];

function render_message(message: AssistantMessage): HTMLElement {
  const rendered = render_with_app_context(RagMessageView, {
    app_context: {
      stores: {
        editor: { open_note: null },
        vault: { vault: { path: "/vault/root" } },
      },
      action_registry: { execute: vi.fn().mockResolvedValue(undefined) },
    } as unknown as Partial<AppContext>,
    props: { message },
  });
  cleanups.push(() => rendered.cleanup());
  return rendered.target;
}

function innermost_with_text(target: HTMLElement, text: string): HTMLElement {
  const match = [...target.querySelectorAll<HTMLElement>("*")]
    .reverse()
    .find((el) => el.textContent?.includes(text));
  if (!match) throw new Error(`No element renders "${text}"`);
  return match;
}

function expect_selectable(target: HTMLElement, text: string) {
  const el = innermost_with_text(target, text);
  expect(
    el.closest(".select-text"),
    `"${text}" has no select-text ancestor`,
  ).not.toBeNull();
}

afterEach(() => {
  for (const cleanup of cleanups) cleanup();
  cleanups = [];
});

describe("AssistantMessage selection affordances", () => {
  it("makes the user bubble selectable", () => {
    const target = render_message({
      id: "u1",
      role: "user",
      content: "how do I export a note?",
      citations: [],
    });

    expect_selectable(target, "how do I export a note?");
  });

  it("makes the reasoning body selectable", () => {
    const target = render_message({
      id: "a1",
      role: "assistant",
      content: "Use the export command.",
      citations: [],
      reasoning: "the user wants an export path",
    });

    expect_selectable(target, "the user wants an export path");
  });

  it("makes tool-call rows selectable", () => {
    const target = render_message({
      id: "a2",
      role: "assistant",
      content: "Done.",
      citations: [],
      tool_events: [
        { name: "read_note", input_summary: "inbox/a.md", ok: true },
      ],
    });

    expect_selectable(target, "read_note");
    expect_selectable(target, "inbox/a.md");
  });

  it("makes the error row selectable", () => {
    const target = render_message({
      id: "a3",
      role: "assistant",
      content: "",
      citations: [],
      error: "blocked by the provider",
    });

    expect_selectable(target, "Failed: blocked by the provider");
  });

  it("keeps inline citation chips selectable so a drag can span them", () => {
    const target = render_message({
      id: "a4",
      role: "assistant",
      content: "Exports live in settings [1] and nowhere else.",
      citations: [{ index: 1, note_path: "notes/export.md", title: "Export" }],
    });

    const chip = target.querySelector<HTMLElement>("[data-citation-index]");
    expect(chip).not.toBeNull();
    // the chip is a <button>, which app.css re-denies at zero specificity —
    // it must carry select-text itself, an ancestor is not enough
    expect(chip?.classList.contains("select-text")).toBe(true);
  });
});
