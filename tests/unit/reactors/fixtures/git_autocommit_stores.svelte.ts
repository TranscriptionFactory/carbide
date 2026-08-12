export type AutocommitMode = "off" | "on_save" | "interval";

export type FakeOpenNote = {
  is_dirty: boolean;
  meta: { path: string };
} | null;

export function create_editor_store(initial_path: string) {
  const store = $state({
    open_note: {
      is_dirty: false,
      meta: { path: initial_path },
    } as FakeOpenNote,
  });
  return store;
}

export function create_notes_store(paths: string[]) {
  const store = $state({
    notes: paths.map((path) => ({ path })) as { path: string }[],
  });
  return store;
}

export function create_git_store(enabled: boolean) {
  const store = $state({ enabled, sync_status: "idle" as string });
  return store;
}

export function create_ui_store(
  mode: AutocommitMode,
  interval_minutes: number,
) {
  const store = $state({
    editor_settings: {
      git_autocommit_mode: mode,
      git_autocommit_interval_minutes: interval_minutes,
    },
  });
  return store;
}
