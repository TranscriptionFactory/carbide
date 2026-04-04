import { describe, expect, it } from "vitest";
import { SvelteMap, SvelteSet } from "svelte/reactivity";
import {
  batch_clear_folder_filetree_state,
  inject_linked_source_folders,
  load_linked_source_folder,
} from "$lib/features/folder/application/filetree_action_helpers";
import type { ActionRegistrationInput } from "$lib/app/action_registry/action_registration_input";
import { NotesStore } from "$lib/features/note";
import { VaultStore } from "$lib/features/vault";
import type {
  FolderLoadState,
  FolderPaginationState,
} from "$lib/shared/types/filetree";

function make_input(paths: string[]) {
  const load_states = new SvelteMap<string, FolderLoadState>();
  const error_messages = new SvelteMap<string, string>();
  const pagination = new SvelteMap<string, FolderPaginationState>();

  for (const path of paths) {
    load_states.set(path, "loaded");
    error_messages.set(path, `error:${path}`);
    pagination.set(path, {
      loaded_count: 10,
      total_count: 10,
      load_state: "idle",
      error_message: null,
    });
  }

  const filetree = {
    expanded_paths: new SvelteSet<string>(),
    load_states,
    error_messages,
    pagination,
  };

  const input = {
    stores: {
      ui: { filetree } as ActionRegistrationInput["stores"]["ui"],
    },
  } as ActionRegistrationInput;

  return input;
}

describe("batch_clear_folder_filetree_state", () => {
  it("clears load_states, error_messages, and pagination for all specified paths", () => {
    const input = make_input(["a/b", "c/d", "e/f"]);

    batch_clear_folder_filetree_state(input, ["a/b", "c/d"]);

    expect(input.stores.ui.filetree.load_states.has("a/b")).toBe(false);
    expect(input.stores.ui.filetree.error_messages.has("a/b")).toBe(false);
    expect(input.stores.ui.filetree.pagination.has("a/b")).toBe(false);

    expect(input.stores.ui.filetree.load_states.has("c/d")).toBe(false);
    expect(input.stores.ui.filetree.error_messages.has("c/d")).toBe(false);
    expect(input.stores.ui.filetree.pagination.has("c/d")).toBe(false);
  });

  it("does not affect paths not in the list", () => {
    const input = make_input(["a/b", "c/d"]);

    batch_clear_folder_filetree_state(input, ["a/b"]);

    expect(input.stores.ui.filetree.load_states.has("c/d")).toBe(true);
    expect(input.stores.ui.filetree.error_messages.has("c/d")).toBe(true);
    expect(input.stores.ui.filetree.pagination.has("c/d")).toBe(true);
  });

  it("is a no-op for empty input", () => {
    const input = make_input(["a/b", "c/d"]);

    batch_clear_folder_filetree_state(input, []);

    expect(input.stores.ui.filetree.load_states.has("a/b")).toBe(true);
    expect(input.stores.ui.filetree.load_states.has("c/d")).toBe(true);
  });
});

describe("linked source filetree helpers", () => {
  it("treats linked-source folder loads as no-ops when reference state is absent", async () => {
    const input = make_input([]);
    const vault = new VaultStore();
    vault.vault = {
      id: "vault-a",
    } as ActionRegistrationInput["stores"]["vault"]["vault"];
    const notes = new NotesStore();
    input.stores = {
      ...input.stores,
      vault,
      notes,
    };
    input.services = {} as ActionRegistrationInput["services"];

    await load_linked_source_folder(input, "@linked/Papers");

    expect(input.stores.ui.filetree.load_states.get("@linked/Papers")).toBe(
      "loaded",
    );
  });

  it("skips linked-source folder injection when reference state is absent", async () => {
    const input = make_input([]);
    const notes = new NotesStore();
    const add_folder_path = () => {
      throw new Error("should not add linked folders without reference state");
    };
    notes.add_folder_path = add_folder_path;
    input.stores = {
      ...input.stores,
      notes,
    };

    await expect(inject_linked_source_folders(input)).resolves.toBeUndefined();
  });
});
