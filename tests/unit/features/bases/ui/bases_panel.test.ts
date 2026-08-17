/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "$lib/app/context/app_context.svelte",
  async () => import("../../../helpers/mock_app_context"),
);

import { create_app_stores } from "$lib/app/bootstrap/create_app_stores";
import { ActionRegistry } from "$lib/app/action_registry/action_registry";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import { register_bases_actions } from "$lib/features/bases/application/bases_actions";
import type { BasesService } from "$lib/features/bases/application/bases_service";
import type { AppContext } from "$lib/app/di/create_app_context";
import type { UIStore } from "$lib/app/orchestration/ui_store.svelte";
import type { TabStore } from "$lib/features/tab/state/tab_store.svelte";
import type { Vault } from "$lib/shared/types/vault";
import type { ViewMode } from "$lib/features/bases/ports";
import BasesPanel from "$lib/features/bases/ui/bases_panel.svelte";
import { make_base_row } from "../../../helpers/bases_fixtures";
import { render_with_app_context } from "../../../helpers/render_with_app_context";
import { flushSync } from "../../../helpers/svelte_client_runtime";

function render(options: {
  view_mode?: ViewMode;
  sort?: { property: string; descending: boolean };
  available_properties?: { name: string }[];
  bases_service?: BasesService;
}) {
  const stores = create_app_stores();
  stores.vault.set_vault({ id: "vault-1", path: "/v", name: "v" } as Vault);
  stores.bases.active_view_mode = options.view_mode ?? "table";
  stores.bases.set_results({
    rows: [make_base_row("a.md", { status: "done" })],
    total: 1,
  });
  if (options.sort) stores.bases.set_sort(options.sort);
  stores.bases.available_properties = (options.available_properties ?? []).map(
    (p) => ({
      name: p.name,
      property_type: "string",
      count: 1,
      unique_values: null,
    }),
  );

  const bases_service =
    options.bases_service ??
    ({
      refresh_properties: vi.fn().mockResolvedValue(undefined),
      run_query: vi.fn().mockResolvedValue(undefined),
    } as unknown as BasesService);

  const action_registry = new ActionRegistry();
  register_bases_actions(
    action_registry,
    bases_service,
    stores.bases,
    stores.vault,
    {
      toggle_sidebar: vi.fn(),
      set_sidebar_view: vi.fn(),
    } as unknown as UIStore,
    { open_bases_tab: vi.fn() } as unknown as TabStore,
  );

  const view = render_with_app_context(BasesPanel, {
    app_context: {
      stores,
      action_registry,
      services: { bases: bases_service },
    } as unknown as Partial<AppContext>,
    props: {},
  });

  return { ...view, stores, bases_service, action_registry };
}

function open_filters(target: HTMLElement) {
  const button = target.querySelector<HTMLButtonElement>(
    '[aria-label="Toggle filters"]',
  );
  if (!button) throw new Error("missing filters toggle");
  button.click();
  flushSync();
}

function sort_row(target: HTMLElement) {
  return target.querySelector('[data-testid="bases-sort-row"]');
}

function sort_select(target: HTMLElement) {
  const select = target.querySelector<HTMLSelectElement>(
    '[data-testid="bases-sort-property"]',
  );
  if (!select) throw new Error("missing sort property select");
  return select;
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("bases panel sort control visibility", () => {
  it("does not render the sort row in calendar view", () => {
    const view = render({ view_mode: "calendar" });
    open_filters(view.target);

    expect(sort_row(view.target)).toBeNull();

    view.cleanup();
  });

  it("still renders the sort row in tree view", () => {
    const view = render({ view_mode: "tree" });
    open_filters(view.target);

    expect(sort_row(view.target)).not.toBeNull();

    view.cleanup();
  });

  it("still renders the sort row in kanban view", () => {
    const view = render({ view_mode: "kanban" });
    open_filters(view.target);

    expect(sort_row(view.target)).not.toBeNull();

    view.cleanup();
  });

  it("renders the sort row in table view", () => {
    const view = render({ view_mode: "table" });
    open_filters(view.target);

    expect(sort_row(view.target)).not.toBeNull();

    view.cleanup();
  });
});

describe("bases panel sort property select", () => {
  it("offers every sortable column the query builder understands", () => {
    const view = render({});
    open_filters(view.target);

    const values = [...sort_select(view.target).options].map((o) => o.value);
    expect(values).toEqual([
      "",
      "title",
      "path",
      "mtime_ms",
      "ctime_ms",
      "size_bytes",
      "word_count",
      "char_count",
      "heading_count",
      "outlink_count",
      "reading_time_secs",
      "task_count",
      "tasks_done",
      "tasks_todo",
      "next_due_date",
    ]);

    view.cleanup();
  });

  it("selects the resolved column for a seeded sort saved under an alias", () => {
    const view = render({ sort: { property: "modified", descending: true } });
    open_filters(view.target);

    expect(sort_select(view.target).value).toBe("mtime_ms");

    view.cleanup();
  });

  it("selects the created column for a sort saved as the created alias", () => {
    const view = render({ sort: { property: "created", descending: false } });
    open_filters(view.target);

    expect(sort_select(view.target).value).toBe("ctime_ms");

    view.cleanup();
  });

  it("appends frontmatter properties without duplicating built-in columns", () => {
    const view = render({
      available_properties: [{ name: "title" }, { name: "priority" }],
    });
    open_filters(view.target);

    const values = [...sort_select(view.target).options].map((o) => o.value);
    expect(values.filter((v) => v === "title")).toHaveLength(1);
    expect(values.at(-1)).toBe("priority");

    view.cleanup();
  });

  it("shows a frontmatter sort rather than falling back to No sort", () => {
    const view = render({
      sort: { property: "priority", descending: false },
      available_properties: [{ name: "priority" }],
    });
    open_filters(view.target);

    expect(sort_select(view.target).value).toBe("priority");

    view.cleanup();
  });
});

describe("bases panel refresh", () => {
  it("refreshes properties before re-running the query, not concurrently", async () => {
    const calls: string[] = [];
    let release_properties: (() => void) | undefined;
    const properties_gate = new Promise<void>((resolve) => {
      release_properties = resolve;
    });
    const bases_service = {
      refresh_properties: vi.fn(async () => {
        calls.push("refresh_properties");
        await properties_gate;
      }),
      run_query: vi.fn(() => {
        calls.push("run_query");
        return Promise.resolve();
      }),
    } as unknown as BasesService;

    const view = render({ bases_service });
    const button = view.target.querySelector<HTMLButtonElement>(
      '[data-testid="bases-refresh"]',
    );
    if (!button) throw new Error("missing refresh button");

    button.click();
    await Promise.resolve();

    expect(calls).toEqual(["refresh_properties"]);

    release_properties?.();
    await properties_gate;
    await Promise.resolve();
    await Promise.resolve();

    expect(calls).toEqual(["refresh_properties", "run_query"]);

    view.cleanup();
  });

  it("dispatches the refresh action instead of calling the service itself", () => {
    const view = render({});
    const execute = vi.spyOn(view.action_registry, "execute");

    const button = view.target.querySelector<HTMLButtonElement>(
      '[data-testid="bases-refresh"]',
    );
    button?.click();

    expect(execute).toHaveBeenCalledWith(ACTION_IDS.bases_refresh);

    view.cleanup();
  });
});
