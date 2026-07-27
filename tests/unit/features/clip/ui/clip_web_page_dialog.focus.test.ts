/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { tick } from "svelte";
import {
  flushSync,
  mount,
  unmount,
} from "../../../helpers/svelte_client_runtime";
import { create_replaceable_props } from "../../../helpers/reactive_props.svelte";

vi.mock(
  "$lib/components/ui/dialog/index.js",
  async () => import("../../../helpers/ui_stubs/dialog"),
);

import ClipWebPageDialog from "$lib/features/clip/ui/clip_web_page_dialog.svelte";
import type { ClipFormats } from "$lib/features/clip";

type DialogProps = {
  open: boolean;
  url: string;
  name: string;
  folder_path: string;
  folder_paths: string[];
  formats: ClipFormats;
  capture: boolean;
  is_clipping: boolean;
  on_update_url: (url: string) => void;
  on_update_name: (name: string) => void;
  on_update_folder: (folder: string) => void;
  on_update_formats: (formats: ClipFormats) => void;
  on_update_capture: (capture: boolean) => void;
  on_confirm: () => void;
  on_cancel: () => void;
};

type MountedApp = ReturnType<typeof mount>;
let mounted: Array<{ app: MountedApp; target: HTMLElement }> = [];

function render_dialog() {
  const { props, replace } = create_replaceable_props<DialogProps>({
    open: true,
    url: "",
    name: "",
    folder_path: "",
    folder_paths: [],
    formats: { markdown: true, html: false, epub: false },
    capture: false,
    is_clipping: false,
    on_update_url: vi.fn(),
    on_update_name: vi.fn(),
    on_update_folder: vi.fn(),
    on_update_formats: vi.fn(),
    on_update_capture: vi.fn(),
    on_confirm: vi.fn(),
    on_cancel: vi.fn(),
  });
  const target = document.createElement("div");
  document.body.appendChild(target);
  const app = mount(ClipWebPageDialog, { target, props });
  mounted.push({ app, target });
  flushSync();
  return { target, replace };
}

/* The focus effect defers via tick().then(); two awaited ticks let the
   queued focus (or its absence) settle deterministically. */
async function settle() {
  await tick();
  await tick();
}

function input_by_placeholder(
  target: HTMLElement,
  placeholder: string,
): HTMLInputElement {
  const input = target.querySelector<HTMLInputElement>(
    `input[placeholder="${placeholder}"]`,
  );
  if (!input)
    throw new Error(`Input with placeholder "${placeholder}" not found`);
  return input;
}

function url_input(target: HTMLElement) {
  return input_by_placeholder(target, "https://example.com/article");
}

function name_input(target: HTMLElement) {
  return input_by_placeholder(target, "Page title (auto)");
}

afterEach(() => {
  for (const { app, target } of mounted) {
    void unmount(app);
    target.remove();
  }
  mounted = [];
  document.body.innerHTML = "";
});

describe("ClipWebPageDialog focus effect", () => {
  it("focuses the URL input when the dialog opens", async () => {
    const { target } = render_dialog();
    await settle();
    expect(document.activeElement).toBe(url_input(target));
  });

  it("does not steal focus back when props are replaced while open", async () => {
    const { target, replace } = render_dialog();
    await settle();
    expect(document.activeElement).toBe(url_input(target));

    const name = name_input(target);
    name.focus();
    expect(document.activeElement).toBe(name);

    replace({ name: "D" });
    flushSync();
    await settle();
    replace({ name: "Dr" });
    flushSync();
    await settle();

    expect(document.activeElement).toBe(name);
  });

  it("refocuses the URL input on the next open transition", async () => {
    const { target, replace } = render_dialog();
    await settle();
    name_input(target).focus();

    replace({ open: false });
    flushSync();
    expect(target.querySelector("input")).toBeNull();

    replace({ open: true });
    flushSync();
    await settle();
    expect(document.activeElement).toBe(url_input(target));
  });
});
