import { create_debounced_task_controller } from "$lib/reactors/debounced_task";
import type {
  AmbientNotice,
  AssistantNoticeStore,
} from "$lib/features/assistant";
import type { EditorStore } from "$lib/features/editor";
import type { SearchPort } from "$lib/features/search";
import type { UIStore } from "$lib/app";
import type { VaultStore } from "$lib/features/vault";
import type { VaultId } from "$lib/shared/types/ids";

const SCAN_DEBOUNCE_MS = 400;

export type AmbientReactorState = {
  scanned_vault_id: string | null;
  scanned_note_path: string | null;
  last_is_dirty: boolean;
};

export type AmbientReactorInput = {
  settings_loaded: boolean;
  enabled: boolean;
  vault_id: string | null;
  note_path: string | null;
  is_dirty: boolean;
};

export type AmbientDecision = {
  action: "noop" | "clear" | "scan";
  note_path: string | null;
  clear_first: boolean;
  next_state: AmbientReactorState;
};

// Structurally typed rather than imported from
// `assistant/domain/ambient_producers`: the layering lint bans cross-feature
// deep imports, and `assistant/index.ts` is E2-banned for this lane, so the
// producer arrives as a dependency instead. `produce_ambient_notices` satisfies
// this shape. WIRING.md names it as the value to pass at the mount site.
export type AmbientProducer = (
  facts: {
    note_path: string;
    backlinks: readonly unknown[];
    outlinks: readonly unknown[];
    orphan_links: readonly { target_path: string }[];
  },
  now: number,
) => AmbientNotice[];

export const INITIAL_AMBIENT_STATE: AmbientReactorState = {
  scanned_vault_id: null,
  scanned_note_path: null,
  last_is_dirty: false,
};

// Pure so the trigger policy is testable in the cheap `node` environment,
// leaving jsdom for the zero-IO proof alone.
//
// Gate ORDER is load-bearing for I6. `settings_loaded` is read FIRST and bails
// to `noop`, because until settings land the flag still reads as its default
// and acting on it would either scan a vault the user opted out of, or wipe a
// queue on a value nobody chose. This is deliberately stricter than
// `lint.reactor`, which performs IO (`lint_service.stop()`) on its no-vault
// path; treat that as precedent to avoid, not to copy.
export function resolve_ambient_decision(
  state: AmbientReactorState,
  input: AmbientReactorInput,
): AmbientDecision {
  if (!input.settings_loaded) {
    return {
      action: "noop",
      note_path: null,
      clear_first: false,
      next_state: state,
    };
  }

  if (!input.enabled || !input.vault_id || !input.note_path) {
    return {
      action: "clear",
      note_path: null,
      clear_first: false,
      next_state: INITIAL_AMBIENT_STATE,
    };
  }

  const next_state: AmbientReactorState = {
    scanned_vault_id: state.scanned_vault_id,
    scanned_note_path: state.scanned_note_path,
    last_is_dirty: input.is_dirty,
  };

  // Never scan a buffer mid-edit: the index still holds the last saved text, so
  // findings computed now would describe content the user has already changed.
  if (input.is_dirty) {
    return {
      action: "noop",
      note_path: input.note_path,
      clear_first: false,
      next_state,
    };
  }

  const vault_changed = input.vault_id !== state.scanned_vault_id;
  const note_changed = input.note_path !== state.scanned_note_path;
  const save_completed = state.last_is_dirty;

  if (!vault_changed && !note_changed && !save_completed) {
    return {
      action: "noop",
      note_path: input.note_path,
      clear_first: false,
      next_state,
    };
  }

  next_state.scanned_vault_id = input.vault_id;
  next_state.scanned_note_path = input.note_path;

  return {
    action: "scan",
    note_path: input.note_path,
    // Notices are scoped to the vault whose links produced them.
    clear_first: vault_changed && state.scanned_vault_id !== null,
    next_state,
  };
}

export function create_ambient_reactor(
  ui_store: UIStore,
  vault_store: VaultStore,
  editor_store: EditorStore,
  notice_store: AssistantNoticeStore,
  search_port: SearchPort,
  produce: AmbientProducer,
  now: () => number = Date.now,
): () => void {
  let state = INITIAL_AMBIENT_STATE;
  // Guards against a snapshot landing after the note moved on; the reply would
  // otherwise be written against whatever note is open by then.
  let generation = 0;

  const scan = create_debounced_task_controller<{
    vault_id: string;
    note_path: string;
  }>({
    run: ({ vault_id, note_path }) => {
      const scan_generation = generation;
      void search_port
        .get_note_links_snapshot(vault_id as VaultId, note_path)
        .then((snapshot) => {
          if (scan_generation !== generation) return;
          notice_store.replace_for_note(
            note_path,
            produce(
              {
                note_path,
                backlinks: snapshot.backlinks,
                outlinks: snapshot.outlinks,
                orphan_links: snapshot.orphan_links,
              },
              now(),
            ),
          );
        })
        .catch(() => {
          // A failed snapshot means no findings to offer, not an error to
          // surface: ambient is advisory and must never interrupt.
        });
    },
  });

  return $effect.root(() => {
    $effect(() => {
      const decision = resolve_ambient_decision(state, {
        settings_loaded: ui_store.editor_settings_loaded,
        enabled: ui_store.editor_settings.ambient_notices_enabled,
        vault_id: vault_store.active_vault_id,
        note_path: editor_store.open_note?.meta.path ?? null,
        is_dirty: editor_store.open_note?.is_dirty ?? false,
      });
      state = decision.next_state;

      if (decision.action === "noop") return;

      generation += 1;
      scan.cancel();

      if (decision.action === "clear") {
        notice_store.clear();
        return;
      }

      if (decision.clear_first) {
        notice_store.clear();
      }

      const vault_id = vault_store.active_vault_id;
      if (!vault_id || !decision.note_path) return;

      scan.schedule(
        { vault_id: String(vault_id), note_path: decision.note_path },
        SCAN_DEBOUNCE_MS,
      );
    });

    return () => {
      generation += 1;
      scan.cancel();
    };
  });
}
