type PendingSnapshot<T> = {
  value: T;
  serialized: string;
};

type PersistedSnapshotControllerOptions<T> = {
  delay_ms: number;
  serialize: (value: T) => string;
  save: (value: T) => Promise<void>;
};

type FlushSnapshotOptions = {
  next_saved_serialized?: string | null;
};

type PersistSnapshotNowOptions = FlushSnapshotOptions & {
  force?: boolean;
};

export function create_persisted_snapshot_controller<T>(
  controller_options: PersistedSnapshotControllerOptions<T>,
) {
  let last_saved_serialized: string | null = null;
  let pending_snapshot: PendingSnapshot<T> | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function clear_timer() {
    if (!timer) {
      return;
    }
    clearTimeout(timer);
    timer = null;
  }

  function persist_snapshot(
    snapshot: PendingSnapshot<T>,
    next_saved_serialized: string | null = snapshot.serialized,
  ) {
    void controller_options.save(snapshot.value).then(() => {
      last_saved_serialized = next_saved_serialized;
    });
  }

  function schedule(value: T) {
    const serialized = controller_options.serialize(value);
    if (serialized === last_saved_serialized) {
      return;
    }

    pending_snapshot = {
      value,
      serialized,
    };
    clear_timer();
    timer = setTimeout(() => {
      const snapshot = pending_snapshot;
      pending_snapshot = null;
      timer = null;
      if (!snapshot) {
        return;
      }
      persist_snapshot(snapshot);
    }, controller_options.delay_ms);
  }

  function flush_pending(options: FlushSnapshotOptions = {}) {
    clear_timer();
    const snapshot = pending_snapshot;
    pending_snapshot = null;
    if (!snapshot) {
      return;
    }
    const next_saved_serialized =
      options.next_saved_serialized !== undefined
        ? options.next_saved_serialized
        : snapshot.serialized;
    persist_snapshot(snapshot, next_saved_serialized);
  }

  function persist_now(value: T, options: PersistSnapshotNowOptions = {}) {
    const snapshot = {
      value,
      serialized: controller_options.serialize(value),
    };
    if (!options.force && snapshot.serialized === last_saved_serialized) {
      return;
    }

    clear_timer();
    pending_snapshot = null;
    const next_saved_serialized =
      options.next_saved_serialized !== undefined
        ? options.next_saved_serialized
        : snapshot.serialized;
    persist_snapshot(snapshot, next_saved_serialized);
  }

  function clear_pending() {
    pending_snapshot = null;
    clear_timer();
  }

  return {
    clear_pending,
    flush_pending,
    has_pending: () => pending_snapshot !== null,
    persist_now,
    reset_saved: () => {
      last_saved_serialized = null;
    },
    schedule,
  };
}
