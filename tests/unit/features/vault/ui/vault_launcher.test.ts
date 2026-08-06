/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "svelte";
import VaultLauncher from "$lib/features/vault/ui/vault_launcher.svelte";
import type { Vault } from "$lib/shared/types/vault";
import type { VaultId, VaultPath } from "$lib/shared/types/ids";
import { create_test_vault } from "../../../helpers/test_fixtures";
import {
  flushSync,
  mount,
  unmount,
} from "../../../helpers/svelte_client_runtime";

function make_vault(id: string, overrides?: Partial<Vault>): Vault {
  return create_test_vault({
    id: id as VaultId,
    name: id,
    path: `/vaults/${id}` as VaultPath,
    last_opened_at: 1000,
    note_count: 10,
    ...overrides,
  });
}

const research = make_vault("research", { name: "Research Vault" });
const personal = make_vault("personal", { name: "Personal" });
const lab = make_vault("lab", { name: "lab-notebook" });
const archive = make_vault("archive", {
  name: "Old Archive",
  is_available: false,
});

type LauncherProps = Partial<ComponentProps<typeof VaultLauncher>>;

const active: Array<() => void> = [];

function render(props: LauncherProps = {}) {
  const target = document.createElement("div");
  document.body.appendChild(target);

  const on_choose_vault_dir = vi.fn();
  const on_select_vault = vi.fn();
  const on_toggle_pin_vault = vi.fn();
  const on_remove_vault = vi.fn();
  const on_open_settings = vi.fn();
  const on_open_help = vi.fn();

  const app = mount(VaultLauncher, {
    target,
    props: {
      recent_vaults: [research, personal, lab, archive],
      pinned_vault_ids: ["research" as VaultId],
      on_choose_vault_dir,
      on_select_vault,
      on_toggle_pin_vault,
      on_remove_vault,
      on_open_settings,
      on_open_help,
      ...props,
    },
  });
  flushSync();

  const view = {
    target,
    on_choose_vault_dir,
    on_select_vault,
    on_toggle_pin_vault,
    on_remove_vault,
    on_open_settings,
    on_open_help,
    rows: () =>
      Array.from(
        target.querySelectorAll<HTMLElement>(
          '[data-testid="vault-launcher-row"]',
        ),
      ),
    search_input: () =>
      target.querySelector<HTMLInputElement>(
        'input[aria-label="Search vaults"]',
      ),
    require_search_input(): HTMLInputElement {
      const input = this.search_input();
      if (!input) {
        throw new Error("search input not rendered");
      }
      return input;
    },
    set_query(text: string) {
      const input = this.require_search_input();
      input.value = text;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      flushSync();
    },
    keydown(key: string) {
      this.require_search_input().dispatchEvent(
        new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
      );
      flushSync();
    },
  };

  active.push(() => {
    void unmount(app);
    target.remove();
  });
  return view;
}

function row_at(view: ReturnType<typeof render>, index: number): HTMLElement {
  const row = view.rows()[index];
  if (!row) {
    throw new Error(`expected a vault row at index ${String(index)}`);
  }
  return row;
}

afterEach(() => {
  for (const cleanup of active.splice(0)) {
    cleanup();
  }
});

describe("vault_launcher rendering", () => {
  it("renders pinned vaults before recents with section titles", () => {
    const view = render();
    const titles = Array.from(
      view.target.querySelectorAll(".VaultLauncher__section-title"),
    ).map((el) => el.textContent?.trim());
    expect(titles).toEqual(["Pinned", "Recent"]);

    const names = view
      .rows()
      .map((row) =>
        row.querySelector(".VaultLauncher__row-name")?.textContent?.trim(),
      );
    expect(names).toEqual([
      "Research Vault",
      "Personal",
      "lab-notebook",
      "Old Archive",
    ]);
  });

  it("marks unavailable vaults and disables their select button", () => {
    const view = render();
    const archive_row = row_at(view, 3);
    expect(archive_row.dataset.disabled).toBe("true");
    expect(archive_row.textContent).toContain("Unavailable");
    const btn = archive_row.querySelector<HTMLButtonElement>(
      ".VaultLauncher__row-btn",
    );
    expect(btn?.disabled).toBe(true);
  });

  it("shows the vault count and app version", () => {
    const view = render({ app_version: "2.27.1" });
    expect(
      view.target.querySelector('[data-testid="vault-launcher-version"]')
        ?.textContent,
    ).toContain("v2.27.1");
    expect(
      view.target
        .querySelector(".VaultLauncher__hint-count")
        ?.textContent?.replace(/\s+/g, " ")
        .trim(),
    ).toBe("4 vaults");
  });

  it("renders the error banner when an error is present", () => {
    const view = render({ error: "Vault could not be opened" });
    expect(
      view.target.querySelector('[data-testid="vault-launcher-error"]')
        ?.textContent,
    ).toContain("Vault could not be opened");
  });
});

describe("vault_launcher selection", () => {
  it("opens a vault on row click", () => {
    const view = render();
    row_at(view, 1)
      .querySelector<HTMLButtonElement>(".VaultLauncher__row-btn")
      ?.click();
    flushSync();
    expect(view.on_select_vault).toHaveBeenCalledWith("personal");
  });

  it("opens the highlighted vault with ArrowDown + Enter", () => {
    const view = render();
    view.keydown("ArrowDown");
    view.keydown("Enter");
    expect(view.on_select_vault).toHaveBeenCalledWith("personal");
  });

  it("does not open an unavailable vault via Enter", () => {
    const view = render();
    view.keydown("ArrowDown");
    view.keydown("ArrowDown");
    view.keydown("ArrowDown");
    view.keydown("Enter");
    expect(view.on_select_vault).not.toHaveBeenCalled();
  });

  it("does not open anything while loading", () => {
    const view = render({ is_loading: true });
    view.keydown("Enter");
    expect(view.on_select_vault).not.toHaveBeenCalled();
  });
});

describe("vault_launcher search", () => {
  it("filters rows by query and resets highlight to the first match", () => {
    const view = render();
    view.set_query("lab");

    const names = view
      .rows()
      .map((row) =>
        row.querySelector(".VaultLauncher__row-name")?.textContent?.trim(),
      );
    expect(names).toEqual(["lab-notebook"]);

    view.keydown("Enter");
    expect(view.on_select_vault).toHaveBeenCalledWith("lab");
  });

  it("shows the no-match message and clears the query on Escape", () => {
    const view = render();
    view.set_query("zzz");
    expect(view.target.textContent).toContain("No vaults match your search");

    view.keydown("Escape");
    expect(view.rows()).toHaveLength(4);
  });
});

describe("vault_launcher row actions", () => {
  it("invokes pin toggle and remove callbacks", () => {
    const view = render();
    const personal_row = row_at(view, 1);
    personal_row
      .querySelector<HTMLButtonElement>('[aria-label="Pin vault"]')
      ?.click();
    flushSync();
    expect(view.on_toggle_pin_vault).toHaveBeenCalledWith("personal");

    personal_row
      .querySelector<HTMLButtonElement>('[aria-label="Remove vault from list"]')
      ?.click();
    flushSync();
    expect(view.on_remove_vault).toHaveBeenCalledWith("personal");
  });

  it("labels the pinned row action as unpin", () => {
    const view = render();
    expect(
      row_at(view, 0).querySelector('[aria-label="Unpin vault"]'),
    ).not.toBeNull();
  });
});

describe("vault_launcher empty state", () => {
  it("renders the empty state with a choose button when no vaults exist", () => {
    const view = render({ recent_vaults: [], pinned_vault_ids: [] });
    const empty = view.target.querySelector(
      '[data-testid="vault-launcher-empty"]',
    );
    expect(empty).not.toBeNull();
    expect(empty?.textContent).toContain("Your notes live in a vault");
    expect(view.search_input()).toBeNull();

    const button = Array.from(empty?.querySelectorAll("button") ?? []).find(
      (el) => el.textContent?.includes("Open Folder"),
    );
    expect(button).toBeDefined();
    button?.click();
    flushSync();
    expect(view.on_choose_vault_dir).toHaveBeenCalledOnce();
  });
});

describe("vault_launcher rail", () => {
  it("invokes the settings and help handlers", () => {
    const view = render();
    const buttons = Array.from(view.target.querySelectorAll("button"));
    buttons.find((el) => el.textContent?.includes("Settings"))?.click();
    buttons.find((el) => el.textContent?.includes("Help"))?.click();
    flushSync();
    expect(view.on_open_settings).toHaveBeenCalledOnce();
    expect(view.on_open_help).toHaveBeenCalledOnce();
  });
});
