import { toast } from "svelte-sonner";

type ConflictCallbacks = {
  on_reload: () => void;
  on_keep: () => void;
};

export class ConflictToastManager {
  private active: {
    note_path: string;
    toast_id: string | number;
  } | null = null;

  show(note_path: string, callbacks: ConflictCallbacks): void {
    if (this.active?.note_path === note_path) return;

    this.dismiss();

    const toast_id = toast.warning("Note has been modified externally", {
      classes: { toast: "toast--stacked-actions" },
      duration: Infinity,
      action: {
        label: "Reload from disk",
        onClick: () => {
          this.active = null;
          callbacks.on_reload();
        },
      },
      cancel: {
        label: "Keep my changes",
        onClick: () => {
          this.active = null;
          callbacks.on_keep();
        },
      },
    });
    this.active = { note_path, toast_id };
  }

  dismiss(note_path?: string): void {
    if (!this.active) return;
    if (note_path && this.active.note_path !== note_path) return;

    toast.dismiss(this.active.toast_id);
    this.active = null;
  }

  dismiss_all(): void {
    if (this.active) {
      toast.dismiss(this.active.toast_id);
    }
    this.active = null;
  }
}
