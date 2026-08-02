import type { GraphPort } from "$lib/features/graph";
import type { SearchPort } from "$lib/features/search";
import type { AmbientNotice } from "$lib/features/assistant";

// C3 shared fixtures (E1). AU-061 renders the rail from these via props while
// AU-060's producers and store mutators are still NOT_IMPLEMENTED, so nothing
// in the UI lane may depend on them landing first.

let next_notice = 0;

export function make_ambient_notice(
  overrides: Partial<AmbientNotice> = {},
): AmbientNotice {
  next_notice += 1;
  return {
    id: `notice-${String(next_notice)}`,
    kind: "stale_link",
    note_path: "notes/ranking-experiments.md",
    // Defaults to a text anchor rather than a whole-note one so a rail that
    // only handles the degenerate case fails on the default fixture.
    anchor: { kind: "text", match: "[[fusion-weights]]", occurrence: 0 },
    provenance: "ambient · link check",
    body: "This note links to [[fusion-weights]], which no longer exists. Repair it?",
    offer: { action_id: "assistant.accept_notice", label: "Repair link" },
    created_at: 1_700_000_000_000 + next_notice,
    ...overrides,
  };
}

export function make_ambient_notices(count: number): AmbientNotice[] {
  return Array.from({ length: count }, () => make_ambient_notice());
}

// --- Recording spy ports for the zero-IO proof (I6) ---------------------
//
// The tree's `create_mock_search_port` and graph test adapter are SILENT
// stubs: they return empty results and record nothing, so a "zero IO when the
// opt-in is off" assertion written against them cannot fail. These variants
// follow the `_calls` recorder convention already used by the notes and index
// mocks rather than inventing a third shape.
//
// Read the warning in AU-060's brief before using these: under vitest's
// default `node` environment a Svelte `$effect` body NEVER runs, so a reactor
// test asserting these arrays are empty passes VACUOUSLY. The test file needs
// `// @vitest-environment jsdom`, a `flushSync()`, and a paired positive
// control proving the same spy DOES record when the opt-in is on.

export type SearchPortSpy = SearchPort & {
  _calls: {
    get_note_links_snapshot: { vault_id: string; note_path: string }[];
  };
};

// Takes an already-configured base rather than an overrides bag: a caller that
// wants a specific snapshot composes it into `base` itself, which keeps exactly
// one place where the return value is decided.
export function create_search_port_spy(base: SearchPort): SearchPortSpy {
  const spy = {
    ...base,
    _calls: {
      get_note_links_snapshot: [] as {
        vault_id: string;
        note_path: string;
      }[],
    },
  } as SearchPortSpy;

  spy.get_note_links_snapshot = (vault_id, note_path) => {
    spy._calls.get_note_links_snapshot.push({
      vault_id: String(vault_id),
      note_path,
    });
    return base.get_note_links_snapshot(vault_id, note_path);
  };

  return spy;
}

export type GraphPortSpy = GraphPort & {
  _calls: {
    load_vault_graph: string[];
    load_note_neighborhood: { vault_id: string; note_path: string }[];
  };
};

export function create_graph_port_spy(base: GraphPort): GraphPortSpy {
  const spy = {
    ...base,
    _calls: {
      load_vault_graph: [] as string[],
      load_note_neighborhood: [] as { vault_id: string; note_path: string }[],
    },
  } as GraphPortSpy;

  spy.load_vault_graph = (vault_id) => {
    spy._calls.load_vault_graph.push(String(vault_id));
    return base.load_vault_graph(vault_id);
  };

  spy.load_note_neighborhood = (vault_id, note_path) => {
    spy._calls.load_note_neighborhood.push({
      vault_id: String(vault_id),
      note_path,
    });
    return base.load_note_neighborhood(vault_id, note_path);
  };

  return spy;
}
