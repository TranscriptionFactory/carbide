/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { create_prevent_scroll_focus_restore } from "$lib/components/ui/focus_restore";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("prevent-scroll focus restore", () => {
  it("captures focus on open and restores it without scrolling on close", () => {
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    trigger.focus();
    const focus = vi.spyOn(trigger, "focus");
    const restore = create_prevent_scroll_focus_restore();

    restore.handle_open(new Event("open"));
    const event = new Event("close", { cancelable: true });
    restore.handle_close(event);

    expect(event.defaultPrevented).toBe(true);
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it("preserves a consumer's prevented close behavior", () => {
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    trigger.focus();
    const focus = vi.spyOn(trigger, "focus");
    const restore = create_prevent_scroll_focus_restore();
    restore.handle_open(new Event("open"));
    const event = new Event("close", { cancelable: true });

    restore.handle_close(event, (close_event) => {
      close_event.preventDefault();
    });

    expect(focus).not.toHaveBeenCalled();
  });
});
