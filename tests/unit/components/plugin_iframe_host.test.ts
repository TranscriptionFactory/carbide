/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import PluginIframeHost from "$lib/features/plugin/ui/plugin_iframe_host.svelte";
import { flushSync, mount, unmount } from "../helpers/svelte_client_runtime";

const cleanups: Array<() => Promise<void>> = [];

function render_host(visible: boolean) {
  const target = document.createElement("div");
  document.body.appendChild(target);
  const on_message = vi.fn();
  const component = mount(PluginIframeHost, {
    target,
    props: {
      plugin_id: "smart-templates",
      vault_path: "/vault name",
      visible,
      on_message,
    },
  });
  flushSync();
  cleanups.push(async () => {
    await unmount(component);
    flushSync();
    target.remove();
  });
  const iframe = target.querySelector("iframe");
  if (!iframe?.contentWindow) throw new Error("Missing plugin iframe");
  const post_message = vi.spyOn(iframe.contentWindow, "postMessage");
  iframe.dispatchEvent(new Event("load"));
  return { iframe, post_message, on_message };
}

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
  document.documentElement.removeAttribute("style");
  vi.restoreAllMocks();
});

describe("plugin iframe host", () => {
  it.each([false, true])(
    "keeps the sandbox and initial theme/lifecycle for visible=%s",
    async (visible) => {
      document.documentElement.style.setProperty("--background", "#ffffff");
      document.documentElement.style.colorScheme = "light";
      const { iframe, post_message } = render_host(visible);
      expect(iframe.getAttribute("sandbox")).toBe("allow-scripts");
      expect(iframe.getAttribute("src")).toContain(
        `vault=%2Fvault%20name&surface=${visible ? "panel" : "runtime"}`,
      );
      expect(iframe.getAttribute("aria-hidden")).toBe(String(!visible));
      expect(post_message).toHaveBeenCalledWith(
        {
          method: "theme.update",
          params: [
            expect.objectContaining({ "--background": "#ffffff" }),
            "light",
          ],
        },
        "*",
      );
      expect(post_message).toHaveBeenCalledWith(
        { method: "lifecycle.activate", params: [] },
        "*",
      );
      window.dispatchEvent(
        new CustomEvent("carbide:plugin-command", {
          detail: {
            plugin_id: "smart-templates",
            command_id: "smart-templates:insert-template",
          },
        }),
      );
      await Promise.resolve();
      expect(post_message).toHaveBeenCalledWith(
        {
          method: "command.execute",
          params: visible
            ? ["smart-templates:insert-template"]
            : ["smart-templates:insert-template", { panel_ready: false }],
        },
        "*",
      );
    },
  );

  it("tells the runtime when an already-loaded panel receives the same command", async () => {
    const runtime = render_host(false);
    const panel = render_host(true);
    window.dispatchEvent(
      new CustomEvent("carbide:plugin-command", {
        detail: {
          plugin_id: "smart-templates",
          command_id: "smart-templates:create-template",
        },
      }),
    );
    await Promise.resolve();
    expect(panel.post_message).toHaveBeenCalledWith(
      {
        method: "command.execute",
        params: ["smart-templates:create-template"],
      },
      "*",
    );
    expect(runtime.post_message).toHaveBeenCalledWith(
      {
        method: "command.execute",
        params: ["smart-templates:create-template", { panel_ready: true }],
      },
      "*",
    );
  });

  it("updates the token bridge when the app theme changes", async () => {
    const { post_message } = render_host(true);
    document.documentElement.style.setProperty("--background", "#121212");
    document.documentElement.style.setProperty("--foreground", "#ffffff");
    document.documentElement.style.colorScheme = "dark";
    await Promise.resolve();
    expect(post_message).toHaveBeenLastCalledWith(
      {
        method: "theme.update",
        params: [
          expect.objectContaining({
            "--background": "#121212",
            "--foreground": "#ffffff",
          }),
          "dark",
        ],
      },
      "*",
    );
  });
});
