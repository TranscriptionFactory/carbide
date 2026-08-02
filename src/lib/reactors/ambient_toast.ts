import type { AmbientNotice } from "$lib/features/assistant";

export type AmbientToastHandle = string | number;

export type AmbientToastActions = {
  on_review: () => void;
  on_dismiss: () => void;
};

// Injected rather than importing `toast` at module scope like
// ConflictToastManager does: the budget below is the thing this class exists to
// guarantee, and a module-scope import makes it unprovable.
export type AmbientToastPort = {
  show: (
    notice: AmbientNotice,
    actions: AmbientToastActions,
  ) => AmbientToastHandle;
  dismiss: (handle: AmbientToastHandle) => void;
};

// AMBIENT_TOAST_MAX_CONCURRENT is 1, enforced structurally by the single
// `active` slot. The budget is applied BEFORE the port is called: sonner's own
// `visibleToasts` is a render cap that QUEUES the excess and drains it one at a
// time, which would turn an ambient burst into a serial drip — precisely the
// interruption the margin rail exists to avoid.
export class AmbientToastManager {
  private active: {
    note_path: string;
    handle: AmbientToastHandle;
  } | null = null;

  constructor(private readonly port: AmbientToastPort) {}

  show(notice: AmbientNotice, actions: AmbientToastActions): void {
    if (this.active?.note_path === notice.note_path) return;

    this.dismiss();
    this.active = {
      note_path: notice.note_path,
      handle: this.port.show(notice, actions),
    };
  }

  dismiss(note_path?: string): void {
    if (!this.active) return;
    if (note_path && this.active.note_path !== note_path) return;

    this.port.dismiss(this.active.handle);
    this.active = null;
  }
}
