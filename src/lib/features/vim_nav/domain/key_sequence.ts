import type {
  NavContext,
  KeySequenceResult,
} from "$lib/features/vim_nav/types/vim_nav_types";
import { resolve_key_sequence, is_vim_nav_prefix } from "./vim_nav_keymap";

export type KeySequenceState = {
  pending: string;
  timeout_id: ReturnType<typeof setTimeout> | null;
};

export function create_key_sequence_state(): KeySequenceState {
  return { pending: "", timeout_id: null };
}

const SEQUENCE_TIMEOUT_MS = 500;

export function process_key(
  state: KeySequenceState,
  context: NavContext,
  key: string,
  on_clear: () => void,
): KeySequenceResult {
  clear_timeout(state);

  if (state.pending === "" && !is_vim_nav_prefix("", key)) {
    const result = resolve_key_sequence(context, key);
    if (result.status !== "pending") return result;
  }

  const sequence = state.pending + key;
  const result = resolve_key_sequence(context, sequence);

  if (result.status === "matched" || result.status === "no_match") {
    state.pending = "";
    return result;
  }

  state.pending = sequence;
  state.timeout_id = setTimeout(() => {
    state.pending = "";
    state.timeout_id = null;
    on_clear();
  }, SEQUENCE_TIMEOUT_MS);

  return { status: "pending" };
}

export function clear_sequence(state: KeySequenceState): void {
  clear_timeout(state);
  state.pending = "";
}

function clear_timeout(state: KeySequenceState): void {
  if (state.timeout_id !== null) {
    clearTimeout(state.timeout_id);
    state.timeout_id = null;
  }
}
