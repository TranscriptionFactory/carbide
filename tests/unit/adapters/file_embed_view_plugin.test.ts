/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { schema } from "$lib/features/editor/adapters/schema";
import { create_file_embed_view_plugin } from "$lib/features/editor/adapters/file_embed_view_plugin";
import type { InlineHtmlTrustConfig } from "$lib/features/editor/domain/inline_html_mode";
import type { TrustLevel } from "$lib/features/document";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn((cmd: string) =>
    Promise.resolve(
      cmd === "html_live_register" ? "carbide-html://embed" : null,
    ),
  ),
}));

const ARTIFACT_HTML = `<p>hi</p><script>window.ran = 1</script>`;

type Harness = {
  view: EditorView;
  container: HTMLElement;
  get_level: ReturnType<typeof vi.fn>;
  request: ReturnType<typeof vi.fn>;
};

function create_trust(options: { level?: TrustLevel; granted?: boolean }): {
  config: InlineHtmlTrustConfig;
  get_level: ReturnType<typeof vi.fn>;
  request: ReturnType<typeof vi.fn>;
} {
  let level: TrustLevel = options.level ?? "safe";
  const get_level = vi.fn(() => Promise.resolve(level));
  const request = vi.fn(() => {
    if (options.granted) level = "live";
    return Promise.resolve(options.granted ?? false);
  });
  return { config: { get_level, request }, get_level, request };
}

function mount(options: {
  src?: string;
  params?: Record<string, string>;
  trust?: { level?: TrustLevel; granted?: boolean };
  resolve_asset_url?: boolean;
}): Harness {
  const container = document.createElement("div");
  document.body.appendChild(container);

  const embed = schema.nodes.file_embed.create({
    src: options.src ?? "chart.html",
    file_type: "html",
    height: 400,
    params: options.params ?? {},
  });
  const doc = schema.nodes.doc.create(null, [embed]);
  const trust = create_trust(options.trust ?? {});
  const with_resolver = options.resolve_asset_url ?? true;
  const plugin = create_file_embed_view_plugin({
    on_open_file: () => {},
    ...(with_resolver
      ? { resolve_asset_url: () => "carbide-asset://vault/chart.html" }
      : {}),
    inline_html_trust: trust.config,
  });
  const state = EditorState.create({ doc, plugins: [plugin] });
  const view = new EditorView(container, {
    state,
    dispatchTransaction: (tr) => {
      view.updateState(view.state.apply(tr));
    },
  });
  return { view, container, ...trust };
}

type RegisterArgs = { html: string; allowNetwork: boolean };

function is_register_args(value: unknown): value is RegisterArgs {
  return (
    typeof value === "object" &&
    value !== null &&
    "html" in value &&
    typeof value.html === "string" &&
    "allowNetwork" in value &&
    typeof value.allowNetwork === "boolean"
  );
}

function register_calls(): RegisterArgs[] {
  return vi
    .mocked(invoke)
    .mock.calls.filter(([cmd]) => cmd === "html_live_register")
    .map(([, args]) => args)
    .filter(is_register_args);
}

function frame(container: HTMLElement, index: number): HTMLIFrameElement {
  const frames = [
    ...container.querySelectorAll<HTMLIFrameElement>(".file-embed-html"),
  ];
  const found = frames[index];
  if (!found) throw new Error(`missing frame ${String(index)}`);
  return found;
}

function mode_btn(container: HTMLElement, label: string): HTMLButtonElement {
  const buttons = [
    ...container.querySelectorAll<HTMLButtonElement>(".html-mode-toggle__btn"),
  ];
  const found = buttons.find((el) => el.textContent === label);
  if (!found) throw new Error(`missing ${label} mode button`);
  return found;
}

function selected_mode(container: HTMLElement): string | undefined {
  const buttons = [
    ...container.querySelectorAll<HTMLButtonElement>(".html-mode-toggle__btn"),
  ];
  return buttons.find((el) =>
    el.classList.contains("html-mode-toggle__btn--active"),
  )?.textContent;
}

async function flush(): Promise<void> {
  for (let turn = 0; turn < 20; turn += 1) {
    await Promise.resolve();
  }
}

describe("FileEmbedView html modes", () => {
  let active_container: HTMLElement | null = null;

  beforeEach(() => {
    vi.mocked(invoke).mockClear();
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(ARTIFACT_HTML),
        }),
      ),
    );
  });

  afterEach(() => {
    if (active_container) {
      document.body.removeChild(active_container);
      active_container = null;
    }
    vi.unstubAllGlobals();
  });

  it("renders a fresh embed in safe mode with Safe selected", async () => {
    const harness = mount({});
    active_container = harness.container;
    await flush();

    expect(register_calls()).toHaveLength(0);
    expect(selected_mode(harness.container)).toBe("Safe");

    const safe = frame(harness.container, 0);
    expect(safe.getAttribute("sandbox")).toBe("allow-same-origin");
    expect(safe.srcdoc).toContain("<p>hi</p>");
    expect(safe.srcdoc).not.toContain("window.ran");
    expect(safe.srcdoc).toContain("connect-src 'none'");

    const live = frame(harness.container, 1);
    expect(live.getAttribute("sandbox")).toBe("allow-scripts");
    expect(live.hidden).toBe(true);

    harness.view.destroy();
  });

  it("keys trust to the embedded file path", async () => {
    const harness = mount({ src: "artifacts/chart.html" });
    active_container = harness.container;
    await flush();

    expect(harness.get_level).toHaveBeenCalledWith("artifacts/chart.html");

    harness.view.destroy();
  });

  it("keeps a live fragment inert while trust is withheld", async () => {
    const harness = mount({ params: { mode: "live" } });
    active_container = harness.container;
    await flush();

    expect(register_calls()).toHaveLength(0);
    expect(selected_mode(harness.container)).toBe("Safe");
    expect(frame(harness.container, 0).hidden).toBe(false);
    expect(harness.request).not.toHaveBeenCalled();

    harness.view.destroy();
  });

  it("runs the artifact in the live frame once trusted", async () => {
    const harness = mount({
      params: { mode: "live" },
      trust: { level: "live" },
    });
    active_container = harness.container;
    await flush();

    expect(register_calls()).toHaveLength(1);
    expect(register_calls()[0]?.html).toContain("window.ran");
    expect(selected_mode(harness.container)).toBe("Live");

    const live = frame(harness.container, 1);
    expect(live.hidden).toBe(false);
    expect(live.getAttribute("src")).toBe("carbide-html://embed");
    expect(live.srcdoc).toBe("");
    expect(frame(harness.container, 0).hidden).toBe(true);

    harness.view.destroy();
  });

  it("switches to live after a granted prompt and stores #mode=live", async () => {
    const harness = mount({ trust: { granted: true } });
    active_container = harness.container;
    await flush();

    mode_btn(harness.container, "Live").click();
    await flush();

    expect(harness.request).toHaveBeenCalledWith("chart.html");
    expect(register_calls()).toHaveLength(1);
    expect(register_calls()[0]?.html).toContain("window.ran");

    const params = harness.view.state.doc.child(0).attrs["params"] as
      | Record<string, string>
      | undefined;
    expect(params).toEqual({ mode: "live" });
    expect(selected_mode(harness.container)).toBe("Live");

    harness.view.destroy();
  });

  it("stays safe when the grant is declined", async () => {
    const harness = mount({});
    active_container = harness.container;
    await flush();

    mode_btn(harness.container, "Live").click();
    await flush();

    expect(harness.request).toHaveBeenCalledTimes(1);
    expect(register_calls()).toHaveLength(0);
    expect(harness.view.state.doc.child(0).attrs["params"]).toEqual({});
    expect(selected_mode(harness.container)).toBe("Safe");

    harness.view.destroy();
  });

  it("returns to safe mode and drops the fragment", async () => {
    const harness = mount({
      params: { mode: "live" },
      trust: { level: "live" },
    });
    active_container = harness.container;
    await flush();
    expect(register_calls()).toHaveLength(1);

    mode_btn(harness.container, "Safe").click();
    await flush();

    expect(harness.view.state.doc.child(0).attrs["params"]).toEqual({});
    expect(selected_mode(harness.container)).toBe("Safe");
    const safe = frame(harness.container, 0);
    expect(safe.hidden).toBe(false);
    expect(safe.srcdoc).not.toContain("window.ran");

    harness.view.destroy();
  });

  it("honours a live+net grant by allowing network in the live frame", async () => {
    const harness = mount({
      params: { mode: "live" },
      trust: { level: "live+net" },
    });
    active_container = harness.container;
    await flush();

    expect(register_calls()[0]?.allowNetwork).toBe(true);

    harness.view.destroy();
  });

  it("releases the registered live document when the view is destroyed", async () => {
    const harness = mount({
      params: { mode: "live" },
      trust: { level: "live" },
    });
    active_container = harness.container;
    await flush();

    harness.view.destroy();

    const released = vi
      .mocked(invoke)
      .mock.calls.filter(([cmd]) => cmd === "html_live_release")
      .map(([, args]) => args)
      .filter(
        (args): args is { url: string } =>
          typeof args === "object" &&
          args !== null &&
          "url" in args &&
          typeof args.url === "string",
      );
    expect(released.map((args) => args.url)).toContain("carbide-html://embed");
  });

  it("renders the placeholder when no resolver is available", async () => {
    const harness = mount({ resolve_asset_url: false });
    active_container = harness.container;
    await flush();

    expect(register_calls()).toHaveLength(0);
    expect(frame(harness.container, 0).srcdoc).toContain(
      "HTML preview unavailable",
    );

    harness.view.destroy();
  });
});
