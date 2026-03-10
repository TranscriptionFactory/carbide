import type { OpenNoteState } from "$lib/shared/types/editor";

export type ActivePane = "primary" | "secondary";
export type SecondaryEditorProfile = "light" | "full" | "large-note-fallback";

const LARGE_NOTE_THRESHOLD = 200_000;

export class SplitViewStore {
  active = $state(false);
  secondary_note = $state<OpenNoteState | null>(null);
  active_pane = $state<ActivePane>("primary");
  secondary_profile = $state<SecondaryEditorProfile>("light");

  open_secondary(note: OpenNoteState) {
    this.active = true;
    this.secondary_note = note;
    this.active_pane = "secondary";
    this.secondary_profile =
      note.markdown.length >= LARGE_NOTE_THRESHOLD
        ? "large-note-fallback"
        : "light";
  }

  close() {
    this.active = false;
    this.secondary_note = null;
    this.active_pane = "primary";
    this.secondary_profile = "light";
  }

  set_secondary_note(note: OpenNoteState | null) {
    this.secondary_note = note;
    if (!note) {
      this.secondary_profile = "light";
      return;
    }
    if (note.markdown.length >= LARGE_NOTE_THRESHOLD) {
      this.secondary_profile = "large-note-fallback";
      return;
    }
    if (this.secondary_profile === "large-note-fallback") {
      this.secondary_profile = "light";
    }
  }

  set_active_pane(pane: ActivePane) {
    this.active_pane = pane;
    if (
      pane === "secondary" &&
      this.secondary_profile === "light" &&
      this.secondary_note
    ) {
      this.secondary_profile = "full";
    }
  }
}
