/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  flushSync,
  mount,
  unmount,
} from "../../../helpers/svelte_client_runtime";

vi.mock(
  "$lib/components/ui/dialog/index.js",
  async () => import("../../../helpers/ui_stubs/dialog"),
);

import ClipWebPageDialog from "$lib/features/clip/ui/clip_web_page_dialog.svelte";
import type { ClipFormats } from "$lib/features/clip";

type MountedApp = ReturnType<typeof mount>;
let mounted: Array<{ app: MountedApp; target: HTMLElement }> = [];

function render_dialog(props?: {
  url?: string;
  formats?: ClipFormats;
  is_clipping?: boolean;
  on_confirm?: () => void;
  on_update_formats?: (formats: ClipFormats) => void;
}) {
  const target = document.createElement("div");
  document.body.appendChild(target);
  const app = mount(ClipWebPageDialog, {
    target,
    props: {
      open: true,
      url: props?.url ?? "",
      name: "",
      folder_path: "",
      folder_paths: [],
      formats: props?.formats ?? { markdown: true, html: false, epub: false },
      is_clipping: props?.is_clipping ?? false,
      on_update_url: vi.fn(),
      on_update_name: vi.fn(),
      on_update_folder: vi.fn(),
      on_update_formats: props?.on_update_formats ?? vi.fn(),
      on_confirm: props?.on_confirm ?? vi.fn(),
      on_cancel: vi.fn(),
    },
  });
  mounted.push({ app, target });
  flushSync();
  return target;
}

function confirm_button(target: HTMLElement): HTMLButtonElement {
  const button = [...target.querySelectorAll("button")].find((el) =>
    el.textContent?.includes("Clip"),
  );
  if (!button) throw new Error("Confirm button not found");
  return button;
}

afterEach(() => {
  for (const { app, target } of mounted) {
    void unmount(app);
    target.remove();
  }
  mounted = [];
});

describe("ClipWebPageDialog", () => {
  it("disables confirm for an invalid url", () => {
    const target = render_dialog({ url: "not-a-url" });
    expect(confirm_button(target).disabled).toBe(true);
  });

  it("disables confirm when no format is selected", () => {
    const target = render_dialog({
      url: "https://example.com/post",
      formats: { markdown: false, html: false, epub: false },
    });
    expect(confirm_button(target).disabled).toBe(true);
  });

  it("enables confirm for a valid url with a format", () => {
    const target = render_dialog({ url: "https://example.com/post" });
    expect(confirm_button(target).disabled).toBe(false);
  });

  it("reports format toggles", () => {
    const on_update_formats = vi.fn();
    const target = render_dialog({
      url: "https://example.com/post",
      on_update_formats,
    });
    const checkboxes = [
      ...target.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
    ];
    expect(checkboxes).toHaveLength(3);
    checkboxes[1]?.click();
    flushSync();
    expect(on_update_formats).toHaveBeenCalledWith({
      markdown: true,
      html: true,
      epub: false,
    });
  });
});
