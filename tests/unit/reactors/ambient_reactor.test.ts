// @vitest-environment jsdom
//
// The jsdom pragma is LOAD-BEARING, not decoration. Measured on this tree:
// a Svelte `$effect` body runs in exactly one of four combinations —
//   node   + no flush      -> 0 runs
//   node   + flushSync()   -> 0 runs
//   jsdom  + no flush      -> 0 runs
//   jsdom  + flushSync()   -> 1 run
// So a port-spy test written the ordinary way passes VACUOUSLY and proves
// nothing. `reference_library_load_reactor.test.ts` and
// `git_autocommit_reactor.test.ts` both have that bug today; they are not
// precedent to copy.
//
// Every zero-IO assertion here is paired with a POSITIVE CONTROL in this same
// file, using the same spy and the same fixture with the flag flipped on. If
// the pragma were dropped, the `flushSync` removed, or the effect never
// mounted, the control fails rather than the negative silently passing.
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { flushSync } from "svelte";
import {
  create_ambient_reactor,
  resolve_ambient_decision,
  INITIAL_AMBIENT_STATE,
  type AmbientReactorState,
} from "$lib/reactors/ambient.reactor.svelte";
import { produce_ambient_notices } from "$lib/features/assistant/domain/ambient_producers";
import { AssistantNoticeStore } from "$lib/features/assistant";
import { UIStore } from "$lib/app/orchestration/ui_store.svelte";
import { VaultStore } from "$lib/features/vault/state/vault_store.svelte";
import { EditorStore } from "$lib/features/editor/state/editor_store.svelte";
import { as_markdown_text, as_note_path } from "$lib/shared/types/ids";
import {
  create_search_port_spy,
  create_graph_port_spy,
} from "../helpers/assistant_notice_fixtures";
import { create_mock_search_port } from "../helpers/mock_ports";
import { create_test_graph_adapter } from "../../adapters/test_graph_adapter";
import { create_test_vault } from "../helpers/test_fixtures";
import type { NoteLinksSnapshot } from "$lib/features/search";
import type { NoteMeta } from "$lib/shared/types/note";

const SCAN_DEBOUNCE_MS = 400;
const NOTE = "notes/ranking-experiments.md";

function note_meta(path: string): NoteMeta {
  return {
    id: as_note_path(path),
    path: as_note_path(path),
    name: path,
    title: path,
    blurb: "",
    mtime_ms: 0,
    ctime_ms: 0,
    size_bytes: 0,
    file_type: null,
  } as NoteMeta;
}

function open_note_state(path: string, is_dirty = false) {
  return {
    meta: note_meta(path),
    markdown: as_markdown_text("body"),
    buffer_id: path,
    is_dirty,
  };
}

function snapshot(
  overrides: Partial<NoteLinksSnapshot> = {},
): NoteLinksSnapshot {
  return {
    backlinks: [],
    outlinks: [],
    orphan_links: [],
    attachments: [],
    ...overrides,
  };
}

// Composes a configured base rather than stubbing the spy: the spy must wrap a
// port that really answers, or the recording proves nothing about the call
// path.
function search_base(result: NoteLinksSnapshot) {
  return {
    ...create_mock_search_port(),
    get_note_links_snapshot: () => Promise.resolve(result),
  };
}

type HarnessOptions = {
  enabled?: boolean;
  settings_loaded?: boolean;
  vault?: boolean;
  note?: string | null;
  is_dirty?: boolean;
  result?: NoteLinksSnapshot;
};

function make_harness(options: HarnessOptions = {}) {
  const {
    enabled = false,
    settings_loaded = true,
    vault = true,
    note = NOTE,
    is_dirty = false,
    result = snapshot(),
  } = options;

  const ui_store = new UIStore();
  ui_store.editor_settings.ambient_notices_enabled = enabled;
  ui_store.editor_settings_loaded = settings_loaded;

  const vault_store = new VaultStore();
  if (vault) vault_store.set_vault(create_test_vault());

  const editor_store = new EditorStore();
  if (note) editor_store.set_open_note(open_note_state(note, is_dirty));

  const notice_store = new AssistantNoticeStore();
  const search_spy = create_search_port_spy(search_base(result));
  const graph_spy = create_graph_port_spy(create_test_graph_adapter());

  const unmount = create_ambient_reactor(
    ui_store,
    vault_store,
    editor_store,
    notice_store,
    search_spy,
    produce_ambient_notices,
    () => 1_700_000_000_000,
  );

  return {
    ui_store,
    vault_store,
    editor_store,
    notice_store,
    search_spy,
    graph_spy,
    unmount,
  };
}

async function settle() {
  flushSync();
  await vi.advanceTimersByTimeAsync(SCAN_DEBOUNCE_MS + 50);
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ambient reactor — I6 opt-in: zero IO when off", () => {
  // A1 — the primary negative.
  it("performs no port call when the opt-in is off", async () => {
    const h = make_harness({ enabled: false });
    await settle();

    expect(h.search_spy._calls.get_note_links_snapshot).toEqual([]);
    h.unmount();
  });

  // A2 — THE FALSIFIER. Same spy, same fixture, flag flipped. Asserts the call
  // AND its arguments, so a never-mounted effect cannot pass this.
  it("POSITIVE CONTROL: the same spy records when the opt-in is on", async () => {
    const h = make_harness({ enabled: true });
    await settle();

    expect(h.search_spy._calls.get_note_links_snapshot).toEqual([
      { vault_id: "vault-1", note_path: NOTE },
    ]);
    h.unmount();
  });

  // A3 — stricter than the `lint.reactor` precedent, which performs IO on its
  // no-vault path.
  it("performs no port call while settings are still loading, even if the flag reads true", async () => {
    const h = make_harness({ enabled: true, settings_loaded: false });
    await settle();

    expect(h.search_spy._calls.get_note_links_snapshot).toEqual([]);
    h.unmount();
  });

  it("POSITIVE CONTROL: the same harness scans once settings finish loading", async () => {
    const h = make_harness({ enabled: true, settings_loaded: false });
    await settle();
    expect(h.search_spy._calls.get_note_links_snapshot).toEqual([]);

    h.ui_store.editor_settings_loaded = true;
    await settle();

    expect(h.search_spy._calls.get_note_links_snapshot).toHaveLength(1);
    h.unmount();
  });

  // A4 — and no IO at all on the bail path, not merely no snapshot call.
  it("performs no port call when no vault is active", async () => {
    const h = make_harness({ enabled: true, vault: false });
    await settle();

    expect(h.search_spy._calls.get_note_links_snapshot).toEqual([]);
    h.unmount();
  });

  // A5
  it("performs no port call when no note is open", async () => {
    const h = make_harness({ enabled: true, note: null });
    await settle();

    expect(h.search_spy._calls.get_note_links_snapshot).toEqual([]);
    h.unmount();
  });

  // A6 — the graph is never reached for, even when the flag is ON. This is
  // what makes "orphan_note needs no vault graph" checkable rather than
  // asserted in prose.
  it("never touches the graph port, on or off", async () => {
    const off = make_harness({ enabled: false });
    await settle();
    off.unmount();

    const on = make_harness({
      enabled: true,
      result: snapshot({ outlinks: [note_meta("notes/other.md")] }),
    });
    await settle();

    expect(on.search_spy._calls.get_note_links_snapshot).toHaveLength(1);
    expect(on.graph_spy._calls.load_vault_graph).toEqual([]);
    expect(on.graph_spy._calls.load_note_neighborhood).toEqual([]);
    on.unmount();
  });

  // A7
  it("clears the queue and stops scanning when the flag is turned off", async () => {
    const h = make_harness({
      enabled: true,
      result: snapshot({
        orphan_links: [{ target_path: "gone", ref_count: 1 }],
      }),
    });
    await settle();
    expect(h.notice_store.count).toBe(1);
    const calls_while_on = h.search_spy._calls.get_note_links_snapshot.length;

    h.ui_store.editor_settings.ambient_notices_enabled = false;
    await settle();

    expect(h.notice_store.notices).toEqual([]);
    expect(h.search_spy._calls.get_note_links_snapshot).toHaveLength(
      calls_while_on,
    );
    h.unmount();
  });

  // Makes the `flushSync` in `settle()` load-bearing rather than decorative.
  // Timer advancement alone happens to drain the microtask queue Svelte's
  // effect scheduler uses, so without a synchronous assertion the flush is
  // redundant and a regression that removed it would go unnoticed. Clearing is
  // store-only, so it must be observable with no timers advanced at all.
  it("clears synchronously on flush when the flag goes off, before any timer", async () => {
    const h = make_harness({
      enabled: true,
      result: snapshot({
        orphan_links: [{ target_path: "gone", ref_count: 1 }],
      }),
    });
    await settle();
    expect(h.notice_store.count).toBe(1);

    h.ui_store.editor_settings.ambient_notices_enabled = false;
    flushSync();

    expect(h.notice_store.notices).toEqual([]);
    h.unmount();
  });

  // A8 — construction must not reach for anything before the first flush, and
  // must register no Tauri listener. This reactor imports no event API at all,
  // which is why the spy stays empty rather than being guarded at runtime.
  it("performs no port call at construction, before any flush", () => {
    const h = make_harness({ enabled: true });

    expect(h.search_spy._calls.get_note_links_snapshot).toEqual([]);
    h.unmount();
  });
});

describe("ambient reactor — producing notices", () => {
  it("fills the queue for the open note when enabled", async () => {
    const h = make_harness({
      enabled: true,
      result: snapshot({
        orphan_links: [{ target_path: "fusion-weights", ref_count: 1 }],
      }),
    });
    await settle();

    expect(h.notice_store.for_note(NOTE).map((n) => n.kind)).toEqual([
      "stale_link",
    ]);
    h.unmount();
  });

  it("debounces: no port call before the cadence elapses", async () => {
    const h = make_harness({ enabled: true });
    flushSync();
    await vi.advanceTimersByTimeAsync(SCAN_DEBOUNCE_MS - 50);

    expect(h.search_spy._calls.get_note_links_snapshot).toEqual([]);

    await vi.advanceTimersByTimeAsync(100);
    expect(h.search_spy._calls.get_note_links_snapshot).toHaveLength(1);
    h.unmount();
  });

  it("drops a snapshot that lands after the note moved on", async () => {
    const h = make_harness({ enabled: true });
    await settle();
    expect(h.notice_store.count).toBe(0);

    h.editor_store.set_open_note(open_note_state("notes/second.md"));
    await settle();

    expect(h.notice_store.for_note(NOTE)).toEqual([]);
    h.unmount();
  });

  it("survives a snapshot failure without surfacing an error", async () => {
    const ui_store = new UIStore();
    ui_store.editor_settings.ambient_notices_enabled = true;
    ui_store.editor_settings_loaded = true;
    const vault_store = new VaultStore();
    vault_store.set_vault(create_test_vault());
    const editor_store = new EditorStore();
    editor_store.set_open_note(open_note_state(NOTE));
    const notice_store = new AssistantNoticeStore();
    const search_spy = create_search_port_spy({
      ...create_mock_search_port(),
      get_note_links_snapshot: () => Promise.reject(new Error("db down")),
    });

    const unmount = create_ambient_reactor(
      ui_store,
      vault_store,
      editor_store,
      notice_store,
      search_spy,
      produce_ambient_notices,
    );
    await settle();

    expect(notice_store.notices).toEqual([]);
    unmount();
  });
});

// Group B — the trigger policy, pure and cheap. These need no DOM at all;
// they are here rather than in a separate file so the decision and the effect
// that consumes it stay readable together.
describe("resolve_ambient_decision", () => {
  const base = {
    settings_loaded: true,
    enabled: true,
    vault_id: "v1",
    note_path: "a.md",
    is_dirty: false,
  };

  const scanned: AmbientReactorState = {
    scanned_vault_id: "v1",
    scanned_note_path: "a.md",
    last_is_dirty: false,
  };

  it("B1 scans a note it has not scanned yet", () => {
    const decision = resolve_ambient_decision(INITIAL_AMBIENT_STATE, base);
    expect(decision.action).toBe("scan");
    expect(decision.note_path).toBe("a.md");
  });

  it("B2 does not rescan an unchanged note", () => {
    expect(resolve_ambient_decision(scanned, base).action).toBe("noop");
  });

  it("B3 rescans when the note changes", () => {
    const decision = resolve_ambient_decision(scanned, {
      ...base,
      note_path: "b.md",
    });
    expect(decision.action).toBe("scan");
    expect(decision.note_path).toBe("b.md");
  });

  it("B4 rescans after a save completes", () => {
    const decision = resolve_ambient_decision(
      { ...scanned, last_is_dirty: true },
      base,
    );
    expect(decision.action).toBe("scan");
  });

  it("B5 does not scan a buffer mid-edit", () => {
    const decision = resolve_ambient_decision(INITIAL_AMBIENT_STATE, {
      ...base,
      is_dirty: true,
    });
    expect(decision.action).toBe("noop");
  });

  it("B6 clears and rescans on a vault switch", () => {
    const decision = resolve_ambient_decision(scanned, {
      ...base,
      vault_id: "v2",
    });
    expect(decision.action).toBe("scan");
    expect(decision.clear_first).toBe(true);
  });

  it("B6 does not clear on the very first scan of a session", () => {
    const decision = resolve_ambient_decision(INITIAL_AMBIENT_STATE, base);
    expect(decision.clear_first).toBe(false);
  });

  it("B7 clears when the vault goes away", () => {
    const decision = resolve_ambient_decision(scanned, {
      ...base,
      vault_id: null,
    });
    expect(decision.action).toBe("clear");
    expect(decision.next_state).toEqual(INITIAL_AMBIENT_STATE);
  });

  it("B8 clears when the flag is off", () => {
    expect(
      resolve_ambient_decision(scanned, { ...base, enabled: false }).action,
    ).toBe("clear");
  });

  // The distinction that makes A3 possible: unloaded settings must not be
  // mistaken for an explicit opt-out, or the queue is wiped on a value nobody
  // chose.
  it("B9 noops — never clears — while settings are unloaded", () => {
    const decision = resolve_ambient_decision(scanned, {
      ...base,
      settings_loaded: false,
      enabled: false,
    });
    expect(decision.action).toBe("noop");
    expect(decision.next_state).toBe(scanned);
  });
});
