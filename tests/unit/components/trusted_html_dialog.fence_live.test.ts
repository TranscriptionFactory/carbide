/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { flushSync, mount, unmount } from "../helpers/svelte_client_runtime";
import {
  clear_mock_app_context,
  set_mock_app_context,
} from "../helpers/mock_app_context";
import { create_test_vault } from "../helpers/test_fixtures";
import { schema } from "$lib/features/editor/adapters/schema";
import { create_code_block_view_prose_plugin } from "$lib/features/editor/adapters/code_block_view_plugin";
import { DocumentService, DocumentStore } from "$lib/features/document";
import type { TrustLevel, TrustedHtmlPort } from "$lib/features/document";
import { VaultStore } from "$lib/features/vault";
import type { AppContext } from "$lib/app/di/create_app_context";

vi.mock(
  "$lib/app/context/app_context.svelte",
  async () => import("../helpers/mock_app_context"),
);
vi.mock(
  "$lib/components/ui/dialog/index.js",
  async () => import("../helpers/ui_stubs/dialog"),
);
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn((cmd: string) =>
    Promise.resolve(cmd === "html_live_register" ? "carbide-html://p" : null),
  ),
}));

import TrustedHtmlDialog from "$lib/features/document/ui/trusted_html_dialog.svelte";

const NOTE_PATH = "notes/host.md";

function create_trust_port() {
  let level: TrustLevel = "safe";
  const grant = vi.fn((_vault_id, _path, _scope, next: TrustLevel) => {
    level = next;
    return Promise.resolve();
  });
  const port: TrustedHtmlPort = {
    get_level: vi.fn(() => Promise.resolve(level)),
    list: vi.fn(() => Promise.resolve([])),
    grant,
    revoke: vi.fn(() => Promise.resolve()),
    parent_folder: vi.fn(() => Promise.resolve("notes")),
  };
  return { port, grant };
}

function create_harness() {
  const document_store = new DocumentStore();
  const vault_store = new VaultStore();
  vault_store.vault = create_test_vault();
  const trust = create_trust_port();
  const service = new DocumentService(
    { resolve_asset_url: vi.fn() } as never,
    vault_store,
    document_store,
    undefined,
    undefined,
    undefined,
    trust.port,
  );
  set_mock_app_context({
    stores: { document: document_store },
    services: { document: service },
  } as unknown as Partial<AppContext>);

  const dialog_target = document.createElement("div");
  document.body.appendChild(dialog_target);
  const dialog = mount(TrustedHtmlDialog, { target: dialog_target });

  const editor_target = document.createElement("div");
  document.body.appendChild(editor_target);
  const code_block = schema.nodes.code_block.create(
    { language: "html", meta: "" },
    schema.text(`<p>hi</p><script>window.ran = 1</script>`),
  );
  const plugin = create_code_block_view_prose_plugin({
    get_note_path: () => NOTE_PATH,
    inline_html_trust: {
      get_level: (path) => service.refresh_trust_level(path),
      request: (path) => service.request_trust_grant(path),
    },
  });
  const view = new EditorView(editor_target, {
    state: EditorState.create({
      doc: schema.nodes.doc.create(null, [code_block]),
      plugins: [plugin],
    }),
    dispatchTransaction: (tr) => {
      view.updateState(view.state.apply(tr));
    },
  });

  return { dialog, dialog_target, editor_target, view, grant: trust.grant };
}

async function settle(): Promise<void> {
  await vi.runAllTimersAsync();
  flushSync();
}

function dialog_root(target: HTMLElement): HTMLElement | null {
  return target.querySelector('[data-testid="dialog-root"]');
}

function button(target: HTMLElement, label: string): HTMLButtonElement {
  const found = [...target.querySelectorAll("button")].find(
    (el) => el.textContent?.trim() === label,
  );
  if (!found) throw new Error(`missing ${label} button`);
  return found;
}

function selected_mode(target: HTMLElement): string | undefined {
  return target.querySelector(".html-mode-toggle__btn--active")?.textContent;
}

describe("TrustedHtmlDialog across the fence Live boundary", () => {
  let harness: ReturnType<typeof create_harness>;

  beforeEach(() => {
    vi.useFakeTimers();
    harness = create_harness();
  });

  afterEach(async () => {
    harness.view.destroy();
    await unmount(harness.dialog);
    document.body.innerHTML = "";
    clear_mock_app_context();
    vi.useRealTimers();
  });

  it("shows the trust dialog for the host note when Live is clicked", async () => {
    await settle();
    expect(dialog_root(harness.dialog_target)).toBeNull();

    button(harness.editor_target, "Live").click();
    await settle();

    const dialog = dialog_root(harness.dialog_target);
    expect(dialog).not.toBeNull();
    expect(dialog?.textContent).toContain("Allow Live HTML?");
    expect(dialog?.textContent).toContain(NOTE_PATH);
    expect(button(harness.dialog_target, "Trust note")).toBeDefined();
  });

  it("renders the fence Live once the user trusts the note", async () => {
    await settle();
    button(harness.editor_target, "Live").click();
    await settle();

    button(harness.dialog_target, "Trust note").click();
    await settle();

    expect(harness.grant).toHaveBeenCalledWith(
      "vault-1",
      NOTE_PATH,
      "file",
      "live",
    );
    expect(dialog_root(harness.dialog_target)).toBeNull();
    expect(harness.view.state.doc.child(0).attrs["meta"]).toBe("live");
    expect(selected_mode(harness.editor_target)).toBe("Live");
  });

  it("keeps the fence Safe when the user cancels", async () => {
    await settle();
    button(harness.editor_target, "Live").click();
    await settle();

    button(harness.dialog_target, "Cancel").click();
    await settle();

    expect(harness.grant).not.toHaveBeenCalled();
    expect(dialog_root(harness.dialog_target)).toBeNull();
    expect(harness.view.state.doc.child(0).attrs["meta"]).toBe("");
    expect(selected_mode(harness.editor_target)).toBe("Safe");
  });
});
