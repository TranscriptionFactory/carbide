/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import AssistantNoticeCard from "$lib/features/assistant/ui/assistant_notice_card.svelte";
import type { AmbientNotice } from "$lib/features/assistant";
import { make_ambient_notice } from "../../../helpers/assistant_notice_fixtures";
import {
  flushSync,
  mount,
  unmount,
} from "../../../helpers/svelte_client_runtime";

function render(
  notice: AmbientNotice,
  on_offer = vi.fn(),
  on_dismiss = vi.fn(),
) {
  const target = document.createElement("div");
  document.body.appendChild(target);

  const app = mount(AssistantNoticeCard, {
    target,
    props: { notice, on_offer, on_dismiss },
  });
  flushSync();

  return {
    target,
    on_offer,
    on_dismiss,
    cleanup() {
      void unmount(app);
      target.remove();
      flushSync();
    },
  };
}

function query(target: HTMLElement, testid: string): HTMLElement {
  const found = target.querySelector<HTMLElement>(`[data-testid="${testid}"]`);
  if (!found) throw new Error(`missing ${testid}`);
  return found;
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("assistant notice card", () => {
  it("renders provenance, body and exactly two actions", () => {
    const view = render(make_ambient_notice());

    expect(
      query(view.target, "assistant-notice-card").querySelectorAll("button"),
    ).toHaveLength(2);

    view.cleanup();
  });

  // The mockup's uppercase provenance comes from CSS (.note-card .src), so the
  // rendered text must stay exactly what the notice carries.
  it("renders the provenance verbatim rather than upcasing it in markup", () => {
    const notice = make_ambient_notice({ provenance: "ambient · link check" });
    const view = render(notice);

    expect(
      query(view.target, "assistant-notice-provenance").textContent?.trim(),
    ).toBe("ambient · link check");

    view.cleanup();
  });

  it("renders the notice body", () => {
    const notice = make_ambient_notice({ body: "One sentence finding." });
    const view = render(notice);

    expect(
      query(view.target, "assistant-notice-body").textContent?.trim(),
    ).toBe("One sentence finding.");

    view.cleanup();
  });

  // The primary is not always an apply — one mocked card offers a navigation.
  it("labels the primary from the offer, not a hardcoded verb", () => {
    const notice = make_ambient_notice({
      offer: { action_id: "assistant.accept_notice", label: "Open both" },
    });
    const view = render(notice);

    expect(
      query(view.target, "assistant-notice-offer").textContent?.trim(),
    ).toBe("Open both");

    view.cleanup();
  });

  it("hands the whole notice to on_offer when the primary is pressed", () => {
    const notice = make_ambient_notice();
    const view = render(notice);

    query(view.target, "assistant-notice-offer").click();

    expect(view.on_offer).toHaveBeenCalledTimes(1);
    expect(view.on_offer).toHaveBeenCalledWith(notice);

    view.cleanup();
  });

  it("hands only the id to on_dismiss when the ghost is pressed", () => {
    const notice = make_ambient_notice();
    const view = render(notice);

    query(view.target, "assistant-notice-dismiss").click();

    expect(view.on_dismiss).toHaveBeenCalledTimes(1);
    expect(view.on_dismiss).toHaveBeenCalledWith(notice.id);

    view.cleanup();
  });

  // Offer-only: a notice can decline and it can propose. There is no third verb
  // on the card, so no control can exist that is neither offer nor dismiss.
  it("exposes no control beyond the offer and the dismiss", () => {
    const view = render(make_ambient_notice());

    const testids = [
      ...view.target.querySelectorAll<HTMLElement>("button"),
    ].map((button) => button.dataset.testid);

    expect(testids).toEqual([
      "assistant-notice-offer",
      "assistant-notice-dismiss",
    ]);

    view.cleanup();
  });
});
