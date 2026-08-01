/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import AssistantStopButton from "$lib/features/assistant/ui/assistant_stop_button.svelte";
import type { RunId, RunRecord, RunStatus } from "$lib/features/assistant";
import {
  create_mock_kernel,
  make_run_record,
} from "../../../helpers/assistant_fixtures";
import {
  flushSync,
  mount,
  unmount,
} from "../../../helpers/svelte_client_runtime";

function render_stop_button(options: {
  run: RunRecord;
  on_stop?: (id: RunId) => void;
  hint?: string;
}) {
  const target = document.createElement("div");
  document.body.appendChild(target);

  const app = mount(AssistantStopButton, {
    target,
    props: {
      run: options.run,
      on_stop: options.on_stop ?? vi.fn(),
      hint: options.hint,
    },
  });

  flushSync();

  return {
    cleanup() {
      void unmount(app);
      target.remove();
      flushSync();
    },
  };
}

function find_button(run_id: string): HTMLButtonElement | null {
  const element = document.body.querySelector(
    `[data-testid="assistant-stop-${run_id}"]`,
  );
  return element instanceof HTMLButtonElement ? element : null;
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("assistant_stop_button.svelte", () => {
  it("renders the stop label with its keyboard hint and stops the run", () => {
    const kernel = create_mock_kernel();
    const view = render_stop_button({
      run: make_run_record({ id: "inline-1", status: "streaming" }),
      on_stop: (id) => {
        kernel.stop(id);
      },
      hint: "esc",
    });

    const button = find_button("inline-1");
    expect(button).toBeInstanceOf(HTMLButtonElement);
    expect(button?.textContent).toContain("Stop");
    expect(button?.textContent).toContain("esc");

    button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    flushSync();

    expect(kernel._stopped).toEqual(["inline-1"]);

    view.cleanup();
  });

  it.each<RunStatus>(["done", "error", "aborted"])(
    "renders nothing once the run is %s",
    (status) => {
      const view = render_stop_button({
        run: make_run_record({ id: "gone", status }),
      });

      expect(find_button("gone")).toBeNull();

      view.cleanup();
    },
  );

  it("disables itself while the run is already stopping", () => {
    const view = render_stop_button({
      run: make_run_record({ id: "winding-down", status: "stopping" }),
    });

    const button = find_button("winding-down");
    expect(button?.disabled).toBe(true);
    expect(button?.textContent).toContain("Stopping");

    view.cleanup();
  });
});
