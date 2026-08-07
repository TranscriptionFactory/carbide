/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "$lib/components/ui/popover",
  async () => import("../../../helpers/ui_stubs/popover"),
);

import PermissionPrompt from "$lib/features/assistant/ui/permission_prompt.svelte";
import type { PermissionOptionSpec } from "$lib/features/assistant/types/agent_events";
import {
  flushSync,
  mount,
  unmount,
} from "../../../helpers/svelte_client_runtime";

const ALLOW_ONCE: PermissionOptionSpec = {
  option_id: "opt-allow-once",
  label: "Allow",
  kind: "allow_once",
};
const ALLOW_ALWAYS: PermissionOptionSpec = {
  option_id: "opt-allow-always",
  label: "Always allow Read",
  kind: "allow_always",
};
const REJECT_ONCE: PermissionOptionSpec = {
  option_id: "opt-reject-once",
  label: "Deny",
  kind: "reject_once",
};

type Choice = { option_id: string; kind: string } | { kind: "cancelled" };

function render_prompt(options: {
  options: PermissionOptionSpec[];
  on_respond?: (choice: Choice) => void;
  host?: HTMLElement;
}) {
  const target = document.createElement("div");
  (options.host ?? document.body).appendChild(target);

  const app = mount(PermissionPrompt, {
    target,
    props: {
      options: options.options,
      on_respond: options.on_respond ?? vi.fn(),
    },
  });

  flushSync();

  return {
    target,
    cleanup() {
      void unmount(app);
      target.remove();
      flushSync();
    },
  };
}

function buttons(target: HTMLElement): HTMLButtonElement[] {
  return [...target.querySelectorAll<HTMLButtonElement>("button")];
}

function by_testid(target: HTMLElement, testid: string): HTMLButtonElement {
  const element = target.querySelector<HTMLButtonElement>(
    `[data-testid="${testid}"]`,
  );
  if (!element) throw new Error(`no element for testid ${testid}`);
  return element;
}

function click(button: HTMLButtonElement): void {
  button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  flushSync();
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("permission_prompt.svelte", () => {
  it("makes allow_once the primary action and reports its id and kind", () => {
    const on_respond = vi.fn();
    const view = render_prompt({
      options: [REJECT_ONCE, ALLOW_ONCE, ALLOW_ALWAYS],
      on_respond,
    });

    const primary = by_testid(view.target, "permission-primary");
    expect(primary.textContent?.trim()).toBe("Allow");
    click(primary);

    expect(on_respond).toHaveBeenCalledWith({
      option_id: "opt-allow-once",
      kind: "allow_once",
    });

    view.cleanup();
  });

  it("pins the refusal leftmost and keeps it visually quiet", () => {
    const view = render_prompt({
      options: [ALLOW_ONCE, ALLOW_ALWAYS, REJECT_ONCE],
    });

    const refuse = by_testid(view.target, "permission-refuse");
    expect(buttons(view.target)[0]).toBe(refuse);
    expect(refuse.className).toContain("text-muted-foreground");
    expect(refuse.className).toContain("hover:bg-accent");
    expect(refuse.className).not.toContain("bg-destructive");
    expect(
      view.target.querySelector(".PermissionPrompt")?.className,
    ).not.toContain("destructive");

    view.cleanup();
  });

  it("reports the refusal option when one is offered", () => {
    const on_respond = vi.fn();
    const view = render_prompt({
      options: [ALLOW_ONCE, REJECT_ONCE],
      on_respond,
    });

    click(by_testid(view.target, "permission-refuse"));

    expect(on_respond).toHaveBeenCalledWith({
      option_id: "opt-reject-once",
      kind: "reject_once",
    });

    view.cleanup();
  });

  it("falls back to reject_always when no reject_once is offered", () => {
    const on_respond = vi.fn();
    const view = render_prompt({
      options: [
        ALLOW_ONCE,
        {
          option_id: "opt-reject-always",
          label: "Never",
          kind: "reject_always",
        },
      ],
      on_respond,
    });

    const refuse = by_testid(view.target, "permission-refuse");
    expect(refuse.textContent?.trim()).toBe("Never");
    click(refuse);

    expect(on_respond).toHaveBeenCalledWith({
      option_id: "opt-reject-always",
      kind: "reject_always",
    });

    view.cleanup();
  });

  it("synthesizes a Deny that cancels when the agent offers no refusal", () => {
    const on_respond = vi.fn();
    const view = render_prompt({
      options: [ALLOW_ONCE, ALLOW_ALWAYS],
      on_respond,
    });

    const refuse = by_testid(view.target, "permission-refuse");
    expect(refuse.textContent?.trim()).toBe("Deny");
    expect(buttons(view.target)[0]).toBe(refuse);
    click(refuse);

    expect(on_respond).toHaveBeenCalledWith({ kind: "cancelled" });

    view.cleanup();
  });

  it("hides allow_always behind a cluster trigger rather than the primary row", () => {
    const on_respond = vi.fn();
    const view = render_prompt({
      options: [ALLOW_ONCE, ALLOW_ALWAYS, REJECT_ONCE],
      on_respond,
    });

    const trigger = by_testid(view.target, "permission-escalate-trigger");
    expect(trigger.getAttribute("aria-label")).toBe("More permission options");

    const escalate = by_testid(view.target, "permission-escalate-option");
    expect(escalate.textContent?.trim()).toBe("Always allow Read");
    click(escalate);

    expect(on_respond).toHaveBeenCalledWith({
      option_id: "opt-allow-always",
      kind: "allow_always",
    });

    view.cleanup();
  });

  it("omits the escalation cluster when no allow_always is offered", () => {
    const view = render_prompt({ options: [ALLOW_ONCE, REJECT_ONCE] });

    expect(
      view.target.querySelector('[data-testid="permission-escalate-trigger"]'),
    ).toBeNull();
    expect(buttons(view.target)).toHaveLength(2);

    view.cleanup();
  });

  it("renders one button per kind when the agent sends synonym labels", () => {
    const view = render_prompt({
      options: [
        ALLOW_ONCE,
        { option_id: "opt-yes", label: "Yes", kind: "allow_once" },
        REJECT_ONCE,
        { option_id: "opt-no", label: "No", kind: "reject_once" },
      ],
    });

    expect(buttons(view.target)).toHaveLength(2);
    expect(
      by_testid(view.target, "permission-primary").textContent?.trim(),
    ).toBe("Allow");
    expect(
      by_testid(view.target, "permission-refuse").textContent?.trim(),
    ).toBe("Deny");

    view.cleanup();
  });

  it("answers once and disables every button after the first click", () => {
    const on_respond = vi.fn();
    const view = render_prompt({
      options: [ALLOW_ONCE, ALLOW_ALWAYS, REJECT_ONCE],
      on_respond,
    });

    click(by_testid(view.target, "permission-primary"));
    click(by_testid(view.target, "permission-refuse"));

    expect(on_respond).toHaveBeenCalledTimes(1);
    expect(on_respond).toHaveBeenCalledWith({
      option_id: "opt-allow-once",
      kind: "allow_once",
    });
    for (const button of buttons(view.target))
      expect(button.disabled).toBe(true);

    view.cleanup();
  });

  it("leaves focus alone when it sits outside the assistant panel", () => {
    const outsider = document.createElement("input");
    document.body.appendChild(outsider);
    document.body.focus();
    expect(document.activeElement).toBe(document.body);

    const view = render_prompt({ options: [ALLOW_ONCE, REJECT_ONCE] });

    expect(document.activeElement).toBe(document.body);

    view.cleanup();
    outsider.remove();
  });

  it("leaves focus alone when it sits in the editor, not the panel", () => {
    const editor = document.createElement("input");
    editor.setAttribute("data-testid", "editor");
    document.body.appendChild(editor);
    editor.focus();

    const view = render_prompt({ options: [ALLOW_ONCE, REJECT_ONCE] });

    expect(document.activeElement).toBe(editor);

    view.cleanup();
    editor.remove();
  });

  it("moves focus to the primary action when the panel already held focus", () => {
    const panel = document.createElement("div");
    panel.setAttribute("data-assistant-panel-root", "");
    const composer = document.createElement("input");
    panel.appendChild(composer);
    document.body.appendChild(panel);
    composer.focus();

    const view = render_prompt({
      options: [ALLOW_ONCE, REJECT_ONCE],
      host: panel,
    });

    expect(document.activeElement).toBe(
      by_testid(view.target, "permission-primary"),
    );

    view.cleanup();
    panel.remove();
  });
});
