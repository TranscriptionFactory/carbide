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

function render_block(props: {
  text: string;
  exit_code?: number | null;
  truncated?: boolean;
}) {
  const target = document.createElement("div");
  document.body.appendChild(target);
  const app = mount(TerminalBlock, {
    target,
    props: {
      text: props.text,
      exit_code: props.exit_code ?? null,
      truncated: props.truncated ?? false,
    },
  });
  mounted.push({ app, target });
  flushSync();
  return target;
}

function output(target: HTMLElement): HTMLElement | null {
  return target.querySelector("[data-testid='terminal-block-output']");
}

function exit_badge(target: HTMLElement): HTMLElement | null {
  return target.querySelector("[data-testid='terminal-block-exit']");
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

  it("omits the exit badge for a zero exit code", () => {
    const target = render_block({ text: "done", exit_code: 0 });
    expect(exit_badge(target)).toBeNull();
  });

  it("omits the exit badge when the exit code is unknown", () => {
    const target = render_block({ text: "running", exit_code: null });
    expect(exit_badge(target)).toBeNull();
  });

  it("shows a destructive exit badge for a non-zero exit code", () => {
    const target = render_block({ text: "boom", exit_code: 127 });
    const badge = exit_badge(target);

    expect(badge?.textContent).toBe("exit 127");
    expect(badge?.className).toContain("text-destructive");
  });

  it("marks trimmed output at the top of the pre", () => {
    const target = render_block({ text: "tail of log", truncated: true });
    const marker = target.querySelector(
      "[data-testid='terminal-block-trimmed']",
    );

    expect(marker?.textContent).toBe("… output trimmed");
    expect(output(target)?.textContent).toBe("… output trimmedtail of log");
    expect(marker?.className).toContain("text-muted-foreground");
  });

  it("omits the trim marker when output is complete", () => {
    const target = render_block({ text: "complete" });

    expect(
      target.querySelector("[data-testid='terminal-block-trimmed']"),
    ).toBeNull();
    expect(output(target)?.textContent).toBe("complete");
  });
});
