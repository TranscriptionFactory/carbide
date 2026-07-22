/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  flushSync,
  mount,
  unmount,
} from "../../../helpers/svelte_client_runtime";
import RagModeToggle from "$lib/features/rag/ui/rag_mode_toggle.svelte";
import { agent_backend } from "$lib/features/ai";
import { BUILTIN_PROVIDER_PRESETS } from "$lib/shared/types/ai_provider_config";
import type { RagSessionMode } from "$lib/features/rag/domain/rag_types";
import type { AgentPermissionMode } from "$lib/features/rag/types/agent_events";

type MountedApp = ReturnType<typeof mount>;
let mounted: Array<{ app: MountedApp; target: HTMLElement }> = [];

function render_toggle(props?: {
  mode?: RagSessionMode;
  permission_mode?: AgentPermissionMode;
  agent_supported?: boolean;
  on_set_mode?: (mode: RagSessionMode) => void;
  on_set_permission_mode?: (mode: AgentPermissionMode) => void;
}) {
  const target = document.createElement("div");
  document.body.appendChild(target);
  const app = mount(RagModeToggle, {
    target,
    props: {
      mode: props?.mode ?? "ask",
      permission_mode: props?.permission_mode ?? "safe",
      agent_supported: props?.agent_supported ?? true,
      on_set_mode: props?.on_set_mode ?? vi.fn(),
      on_set_permission_mode: props?.on_set_permission_mode ?? vi.fn(),
    },
  });
  mounted.push({ app, target });
  flushSync();
  return target;
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
  it("disables the agent segment with a tooltip for a non-agent provider", () => {
    const codex = BUILTIN_PROVIDER_PRESETS.find((p) => p.id === "codex");
    if (!codex) throw new Error("codex preset missing");
    const target = render_toggle({
      agent_supported: agent_backend(codex) !== null,
    });
    const agent = button_labelled(target, "Agent");
    expect(agent.disabled).toBe(true);
    expect(agent.parentElement?.getAttribute("title")).toBe(
      "Agent mode requires the Claude Code provider",
    );
  });

  it("enables the agent segment for the claude provider", () => {
    const claude = BUILTIN_PROVIDER_PRESETS.find((p) => p.id === "claude");
    if (!claude) throw new Error("claude preset missing");
    const on_set_mode = vi.fn();
    const target = render_toggle({
      agent_supported: agent_backend(claude) !== null,
      on_set_mode,
    });
    const agent = button_labelled(target, "Agent");
    expect(agent.disabled).toBe(false);
    expect(agent.parentElement?.hasAttribute("title")).toBe(false);
    agent.click();
    expect(on_set_mode).toHaveBeenCalledWith("agent");
  });

  it("hides the permission picker in ask mode", () => {
    const target = render_toggle({ mode: "ask" });
    expect(target.textContent).not.toContain("Safe");
    expect(target.textContent).not.toContain("Power");
  });

  it("shows the permission picker in agent mode and reports changes", () => {
    const on_set_permission_mode = vi.fn();
    const target = render_toggle({
      mode: "agent",
      permission_mode: "safe",
      on_set_permission_mode,
    });
    const safe = button_labelled(target, "Safe");
    const power = button_labelled(target, "Power");
    expect(safe.getAttribute("aria-pressed")).toBe("true");
    expect(power.getAttribute("aria-pressed")).toBe("false");
    power.click();
    expect(on_set_permission_mode).toHaveBeenCalledWith("power");
  });
});
