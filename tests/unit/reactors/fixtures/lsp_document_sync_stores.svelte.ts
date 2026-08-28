export type FixtureOpenNote = {
  meta: { path: string };
  markdown: string;
  is_dirty: boolean;
};

export function make_open_note(path: string, dirty = false): FixtureOpenNote {
  return {
    meta: { path },
    markdown: "# Test",
    is_dirty: dirty,
  };
}

export function create_editor_store(initial_path: string | null) {
  const store = $state({
    open_note: initial_path ? make_open_note(initial_path) : null,
  });
  return store;
}
