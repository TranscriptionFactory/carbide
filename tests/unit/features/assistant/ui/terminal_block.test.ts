/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  flushSync,
  mount,
  unmount,
} from "../../../helpers/svelte_client_runtime";
import TerminalBlock from "$lib/features/assistant/ui/terminal_block.svelte";

const ESC = String.fromCharCode(0x1b);

type MountedApp = ReturnType<typeof mount>;
let mounted: Array<{ app: MountedApp; target: HTMLElement }> = [];

function render_block(props: { text: string }) {
  const target = document.createElement("div");
  document.body.appendChild(target);
  const app = mount(TerminalBlock, { target, props: { text: props.text } });
  mounted.push({ app, target });
  flushSync();
  return target;
}

function output(target: HTMLElement): HTMLElement | null {
  return target.querySelector("[data-testid='terminal-block-output']");
}

afterEach(() => {
  for (const { app, target } of mounted) {
    void unmount(app);
    target.remove();
  }
  mounted = [];
});

describe("TerminalBlock", () => {
  it("renders terminal text with ansi stripped and redraws collapsed", () => {
    const target = render_block({
      text: `${ESC}[32mbuilding${ESC}[0m\rbuilt\nok`,
    });

    expect(output(target)?.textContent).toBe("built\nok");
  });

  it("renders the text as given when nothing needs collapsing", () => {
    const target = render_block({ text: "complete" });

    expect(output(target)?.textContent).toBe("complete");
  });
});
