/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  flushSync,
  mount,
  unmount,
} from "../../../helpers/svelte_client_runtime";
import RagModeToggle from "$lib/features/assistant/ui/chat_mode_toggle.svelte";
import { agent_capability, agent_scope_copy } from "$lib/features/ai";
import { BUILTIN_PROVIDER_PRESETS } from "$lib/shared/types/ai_provider_config";
import type { AssistantChatMode } from "$lib/features/assistant";

type MountedApp = ReturnType<typeof mount>;
let mounted: Array<{ app: MountedApp; target: HTMLElement }> = [];

function render_toggle(props?: {
  mode?: AssistantChatMode;
  auto_approve?: boolean;
  agent_supported?: boolean;
  auto_approve_hint?: string;
  on_set_mode?: (mode: AssistantChatMode) => void;
  on_set_auto_approve?: (enabled: boolean) => void;
}) {
  const target = document.createElement("div");
  document.body.appendChild(target);
  const app = mount(RagModeToggle, {
    target,
    props: {
      mode: props?.mode ?? "ask",
      auto_approve: props?.auto_approve ?? false,
      agent_supported: props?.agent_supported ?? true,
      auto_approve_hint:
        props?.auto_approve_hint ??
        "Run edits and commands without asking. Change it any time.",
      on_set_mode: props?.on_set_mode ?? vi.fn(),
      on_set_auto_approve: props?.on_set_auto_approve ?? vi.fn(),
    },
  });
  mounted.push({ app, target });
  flushSync();
  return target;
}

function auto_approve_switch(target: HTMLElement): HTMLElement | null {
  return target.querySelector<HTMLElement>(
    '[data-testid="auto-approve-switch"]',
  );
}

function button_labelled(
  target: HTMLElement,
  label: string,
): HTMLButtonElement {
  const button = [...target.querySelectorAll("button")].find(
    (el) => el.textContent?.trim() === label,
  );
  if (!button) throw new Error(`Button "${label}" not found`);
  return button;
}

afterEach(() => {
  for (const { app, target } of mounted) {
    void unmount(app);
    target.remove();
  }
  mounted = [];
});

describe("RagModeToggle", () => {
  it("disables the agent segment with a tooltip for a backend-less provider", () => {
    const ollama = BUILTIN_PROVIDER_PRESETS.find((p) => p.id === "ollama");
    if (!ollama) throw new Error("ollama preset missing");
    const target = render_toggle({
      agent_supported: agent_capability(ollama) !== null,
    });
    const agent = button_labelled(target, "Agent");
    expect(agent.disabled).toBe(true);
    expect(agent.parentElement?.getAttribute("title")).toBe(
      "Agent mode requires a tool-capable provider",
    );
  });

  it("enables the agent segment for the claude provider", () => {
    const claude = BUILTIN_PROVIDER_PRESETS.find((p) => p.id === "claude");
    if (!claude) throw new Error("claude preset missing");
    const on_set_mode = vi.fn();
    const target = render_toggle({
      agent_supported: agent_capability(claude) !== null,
      on_set_mode,
    });
    const agent = button_labelled(target, "Agent");
    expect(agent.disabled).toBe(false);
    expect(agent.parentElement?.hasAttribute("title")).toBe(false);
    agent.click();
    expect(on_set_mode).toHaveBeenCalledWith("agent");
  });

  it("enables the agent segment for a native API provider", () => {
    const lmstudio = BUILTIN_PROVIDER_PRESETS.find((p) => p.id === "lmstudio");
    if (!lmstudio) throw new Error("lmstudio preset missing");
    const target = render_toggle({
      agent_supported: agent_capability(lmstudio) !== null,
    });
    const agent = button_labelled(target, "Agent");
    expect(agent.disabled).toBe(false);
  });

  // S6: the switch is an agent-mode control; Ask runs Carbide's own retrieval
  // and has no tool call to consent to.
  it("hides the auto-approve switch in ask mode", () => {
    const target = render_toggle({ mode: "ask" });
    expect(target.textContent).not.toContain("Auto-approve");
    expect(auto_approve_switch(target)).toBeNull();
  });

  it("shows the auto-approve switch in agent mode and reports both directions", () => {
    const on_set_auto_approve = vi.fn();
    const target = render_toggle({
      mode: "agent",
      auto_approve: false,
      on_set_auto_approve,
    });

    const toggle = auto_approve_switch(target);
    expect(toggle).not.toBeNull();
    expect(toggle?.getAttribute("aria-checked")).toBe("false");

    toggle?.click();
    flushSync();
    expect(on_set_auto_approve).toHaveBeenCalledWith(true);
  });

  // S5: the switch renders the session's state, so flipping it from inside a
  // permission prompt shows up here immediately.
  it("reflects consent granted elsewhere in the session", () => {
    const target = render_toggle({ mode: "agent", auto_approve: true });

    expect(auto_approve_switch(target)?.getAttribute("aria-checked")).toBe(
      "true",
    );
  });

  it("labels the switch with the provider's own account of the grant", () => {
    const claude = BUILTIN_PROVIDER_PRESETS.find((p) => p.id === "claude");
    if (!claude) throw new Error("claude preset missing");
    const capability = agent_capability(claude);
    if (!capability) throw new Error("claude preset lost agent capability");
    const hint = agent_scope_copy(capability).auto_approve_hint;
    const target = render_toggle({
      mode: "agent",
      auto_approve_hint: hint,
    });

    // An ACP agent's reach is the whole system, and the hint must say so
    // rather than describe a vault-scoped grant.
    expect(hint).toContain("system");
    expect(
      [...target.querySelectorAll("[title]")].some(
        (el) => el.getAttribute("title") === hint,
      ),
    ).toBe(true);
  });
});

describe("agent_scope_copy", () => {
  it("keeps the native grant vault-scoped and the ACP grant honest", () => {
    const native = agent_scope_copy({ backend: "native" });
    expect(native.badge).toBe("vault-scoped");
    expect(native.auto_approve_hint).toContain("without asking");

    const acp = agent_scope_copy({
      backend: "acp",
      acp: { kind: "preset", id: "claude" },
    });
    expect(acp.badge).toBe("full access");
    expect(acp.badge_title).toContain("Claude Code");
    // D2: the hint may not understate what the harness can reach.
    expect(acp.auto_approve_hint).toContain("system");
    expect(acp.empty_state).toContain("full system access");
  });
});
