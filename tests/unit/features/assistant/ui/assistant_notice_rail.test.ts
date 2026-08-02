/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import AssistantNoticeRail from "$lib/features/assistant/ui/assistant_notice_rail.svelte";
import {
  AMBIENT_RAIL_CARD_CAP,
  type AmbientNotice,
} from "$lib/features/assistant";
import {
  make_ambient_notice,
  make_ambient_notices,
} from "../../../helpers/assistant_notice_fixtures";
import {
  flushSync,
  mount,
  unmount,
} from "../../../helpers/svelte_client_runtime";

function render(notices: AmbientNotice[]) {
  const target = document.createElement("div");
  document.body.appendChild(target);

  const on_offer = vi.fn();
  const on_dismiss = vi.fn();
  const app = mount(AssistantNoticeRail, {
    target,
    props: { notices, on_offer, on_dismiss },
  });
  flushSync();

  return {
    target,
    on_offer,
    on_dismiss,
    cards: () =>
      target.querySelectorAll('[data-testid="assistant-notice-card"]'),
    overflow: () =>
      target.querySelector('[data-testid="assistant-notice-overflow"]'),
    cleanup() {
      void unmount(app);
      target.remove();
      flushSync();
    },
  };
}

function press_nth(target: HTMLElement, testid: string, index: number): void {
  const button = target.querySelectorAll<HTMLButtonElement>(
    `[data-testid="${testid}"]`,
  )[index];
  if (!button) throw new Error(`missing ${testid} at ${String(index)}`);
  button.click();
}

function at<T>(items: T[], index: number): T {
  const item = items[index];
  if (!item) throw new Error(`expected a notice at ${String(index)}`);
  return item;
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("assistant notice rail", () => {
  it("renders no margin chrome at all when there are no notices", () => {
    const view = render([]);

    expect(
      view.target.querySelector('[data-testid="assistant-notice-rail"]'),
    ).toBeNull();

    view.cleanup();
  });

  it("renders one card per notice below the cap, with no overflow count", () => {
    const view = render(make_ambient_notices(2));

    expect(view.cards()).toHaveLength(2);
    expect(view.overflow()).toBeNull();

    view.cleanup();
  });

  it("renders no overflow count when exactly at the cap", () => {
    const view = render(make_ambient_notices(AMBIENT_RAIL_CARD_CAP));

    expect(view.cards()).toHaveLength(AMBIENT_RAIL_CARD_CAP);
    expect(view.overflow()).toBeNull();

    view.cleanup();
  });

  it("caps the cards and collapses the rest into a margin count", () => {
    const view = render(make_ambient_notices(7));

    expect(view.cards()).toHaveLength(AMBIENT_RAIL_CARD_CAP);
    expect(view.overflow()?.textContent?.trim()).toBe(
      `+${String(7 - AMBIENT_RAIL_CARD_CAP)}`,
    );

    view.cleanup();
  });

  // The house precedent (bases_calendar's "+N more") is non-interactive, and
  // the mockup specifies only a count, no expansion affordance.
  it("renders the overflow count as text, not a control", () => {
    const view = render(make_ambient_notices(6));

    expect(view.overflow()?.tagName).not.toBe("BUTTON");
    expect(view.overflow()?.querySelector("button")).toBeNull();

    view.cleanup();
  });

  it("shows the first notices in queue order, not a sorted subset", () => {
    const notices = [
      make_ambient_notice({ id: "first" }),
      make_ambient_notice({ id: "second" }),
      make_ambient_notice({ id: "third" }),
      make_ambient_notice({ id: "fourth" }),
    ];

    const view = render(notices);

    expect(
      [...view.cards()].map((card) => card.getAttribute("data-notice-id")),
    ).toEqual(["first", "second", "third"]);

    view.cleanup();
  });

  it("forwards a card's offer press to its own notice", () => {
    const notices = make_ambient_notices(2);
    const view = render(notices);

    press_nth(view.target, "assistant-notice-offer", 1);

    expect(view.on_offer).toHaveBeenCalledWith(at(notices, 1));

    view.cleanup();
  });

  it("forwards a card's dismiss press with that notice's id", () => {
    const notices = make_ambient_notices(2);
    const view = render(notices);

    press_nth(view.target, "assistant-notice-dismiss", 0);

    expect(view.on_dismiss).toHaveBeenCalledWith(at(notices, 0).id);

    view.cleanup();
  });
});
