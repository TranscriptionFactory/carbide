import { describe, expect, it, vi } from "vitest";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import type {
  ActionRegistry,
  AppAction,
} from "$lib/app/action_registry/action_registry";
import type { ActionRegistrationInput } from "$lib/app/action_registry/action_registration_input";
import { register_find_in_file_actions } from "$lib/features/search/application/find_in_file_actions";
import { UIStore } from "$lib/app/orchestration/ui_store.svelte";
import { SearchStore } from "$lib/features/search/state/search_store.svelte";
import type { FindSelection } from "$lib/features/editor";

function create_harness(selection: FindSelection | null) {
  const actions = new Map<string, AppAction>();
  const registry = {
    register(action: AppAction) {
      actions.set(action.id, action);
    },
  } as unknown as ActionRegistry;

  const ui = new UIStore();
  const search = new SearchStore();
  const get_selection_range = vi.fn(() => selection);

  register_find_in_file_actions({
    registry,
    stores: { ui, search },
    services: { editor: { get_selection_range } },
  } as unknown as ActionRegistrationInput);

  return {
    ui,
    search,
    get_selection_range,
    run: (id: string) => {
      const action = actions.get(id);
      if (!action) throw new Error(`action not registered: ${id}`);
      return action.execute();
    },
  };
}

const MULTILINE: FindSelection = { from: 4, to: 40, text: "first\nsecond" };
const SHORT: FindSelection = { from: 4, to: 12, text: "haystack" };

describe("find in file open capture", () => {
  it("scopes to a multi-line selection when the bar opens", () => {
    const harness = create_harness(MULTILINE);

    harness.run(ACTION_IDS.find_in_file_toggle);

    expect(harness.ui.find_in_file.open).toBe(true);
    expect(harness.ui.find_in_file.scope).toBe("selection");
    expect(harness.ui.find_in_file.scope_range).toEqual({ from: 4, to: 40 });
  });

  it("seeds the query from a short selection", () => {
    const harness = create_harness(SHORT);

    harness.run(ACTION_IDS.find_in_file_open);

    expect(harness.ui.find_in_file.query).toBe("haystack");
    expect(harness.ui.find_in_file.scope).toBe("document");
  });

  it("leaves an existing query alone when nothing is selected", () => {
    const harness = create_harness(null);
    harness.ui.find_in_file.query = "previous";

    harness.run(ACTION_IDS.find_in_file_open);

    expect(harness.ui.find_in_file.query).toBe("previous");
    expect(harness.ui.find_in_file.scope).toBe("document");
    expect(harness.ui.find_in_file.scope_range).toBeNull();
  });

  it("captures the selection once, before the bar takes focus", () => {
    const harness = create_harness(SHORT);

    harness.run(ACTION_IDS.find_in_file_open);

    expect(harness.get_selection_range).toHaveBeenCalledTimes(1);
  });

  it("clears the scope when the bar is toggled shut", () => {
    const harness = create_harness(MULTILINE);

    harness.run(ACTION_IDS.find_in_file_toggle);
    harness.run(ACTION_IDS.find_in_file_toggle);

    expect(harness.ui.find_in_file.open).toBe(false);
    expect(harness.ui.find_in_file.scope).toBe("document");
    expect(harness.ui.find_in_file.scope_range).toBeNull();
    expect(harness.search.find_match_count).toBe(0);
  });

  it("captures the scope when replace opens the bar", () => {
    const harness = create_harness(MULTILINE);

    harness.run(ACTION_IDS.find_in_file_toggle_replace);

    expect(harness.ui.find_in_file.open).toBe(true);
    expect(harness.ui.find_in_file.show_replace).toBe(true);
    expect(harness.ui.find_in_file.scope).toBe("selection");
  });

  it("does not recapture the scope when replace only collapses", () => {
    const harness = create_harness(MULTILINE);

    harness.run(ACTION_IDS.find_in_file_toggle_replace);
    harness.get_selection_range.mockClear();
    harness.run(ACTION_IDS.find_in_file_toggle_replace);

    expect(harness.get_selection_range).not.toHaveBeenCalled();
    expect(harness.ui.find_in_file.show_replace).toBe(false);
  });
});
