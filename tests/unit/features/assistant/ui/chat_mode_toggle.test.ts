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
import { agent_capability } from "$lib/features/ai";
import { BUILTIN_PROVIDER_PRESETS } from "$lib/shared/types/ai_provider_config";
import type { AssistantChatMode } from "$lib/features/assistant";
import type { AssistantPermissionMode } from "$lib/features/assistant";

type MountedApp = ReturnType<typeof mount>;
let mounted: Array<{ app: MountedApp; target: HTMLElement }> = [];

function render_toggle(props?: {
  mode?: AssistantChatMode;
  permission_mode?: AssistantPermissionMode;
  agent_supported?: boolean;
  backend?: "native" | "harness" | null;
  on_set_mode?: (mode: AssistantChatMode) => void;
  on_set_permission_mode?: (mode: AssistantPermissionMode) => void;
}) {
  const target = document.createElement("div");
  document.body.appendChild(target);
  const app = mount(RagModeToggle, {
    target,
    props: {
      mode: props?.mode ?? "ask",
      permission_mode: props?.permission_mode ?? "safe",
      agent_supported: props?.agent_supported ?? true,
      backend: props?.backend ?? null,
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

  it("describes power as vault-scoped on the native backend", () => {
    const target = render_toggle({ mode: "agent", backend: "native" });
    expect(button_labelled(target, "Power").getAttribute("title")).toBe(
      "Agent can edit files in your vault",
    );
  });

  it("describes power as full system access on a harness backend", () => {
    const target = render_toggle({ mode: "agent", backend: "harness" });
    expect(button_labelled(target, "Power").getAttribute("title")).toBe(
      "Full system access — agent can run shell commands outside the vault",
    );
  });
});
