/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from "vitest";
import { createRawSnippet, type Component, type Snippet } from "svelte";
import { Inbox } from "@lucide/svelte";
import EmptyMessage from "$lib/components/ui/empty_message.svelte";
import { flushSync, mount, unmount } from "../helpers/svelte_client_runtime";

function render_empty_message(props: {
  text: string;
  hint?: string;
  icon?: Component;
  children?: Snippet;
}) {
  const target = document.createElement("div");
  document.body.appendChild(target);
  const app = mount(EmptyMessage, { target, props });
  flushSync();
  return {
    target,
    cleanup() {
      unmount(app);
      target.remove();
      flushSync();
    },
  };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("empty_message.svelte", () => {
  it("renders the text inside the empty-message root", () => {
    const { target, cleanup } = render_empty_message({ text: "Nothing here" });
    const root = target.querySelector('[data-testid="empty-message"]');
    expect(root).not.toBeNull();
    expect(root?.querySelector(".EmptyMessage__text")?.textContent).toBe(
      "Nothing here",
    );
    cleanup();
  });

  it("renders the hint only when given", () => {
    const without = render_empty_message({ text: "t" });
    expect(without.target.querySelector(".EmptyMessage__hint")).toBeNull();
    without.cleanup();

    const with_hint = render_empty_message({ text: "t", hint: "Try this" });
    expect(
      with_hint.target.querySelector(".EmptyMessage__hint")?.textContent,
    ).toBe("Try this");
    with_hint.cleanup();
  });

  it("renders the icon only when given", () => {
    const without = render_empty_message({ text: "t" });
    expect(without.target.querySelector(".EmptyMessage__icon")).toBeNull();
    without.cleanup();

    const with_icon = render_empty_message({ text: "t", icon: Inbox });
    expect(
      with_icon.target.querySelector("svg.EmptyMessage__icon"),
    ).not.toBeNull();
    with_icon.cleanup();
  });

  it("renders children below the hint", () => {
    const children = createRawSnippet(() => ({
      render: () => '<span data-testid="extra">chips</span>',
    }));
    const { target, cleanup } = render_empty_message({
      text: "t",
      hint: "h",
      children,
    });
    const extra = target.querySelector('[data-testid="extra"]');
    expect(extra?.textContent).toBe("chips");
    expect(
      extra!.compareDocumentPosition(
        target.querySelector(".EmptyMessage__hint")!,
      ) & Node.DOCUMENT_POSITION_PRECEDING,
    ).toBeTruthy();
    cleanup();
  });
});
