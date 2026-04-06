import { describe, expect, it } from "vitest";
import {
  matches_activation_event,
  should_activate_for_events,
  extract_file_extension,
  file_matches_vault_contains,
} from "$lib/features/plugin/domain/match_activation_event";

describe("matches_activation_event", () => {
  it("exact match for simple events", () => {
    expect(matches_activation_event("on_startup", "on_startup")).toBe(true);
    expect(
      matches_activation_event("on_startup_finished", "on_startup_finished"),
    ).toBe(true);
    expect(
      matches_activation_event("on_settings_open", "on_settings_open"),
    ).toBe(true);
  });

  it("no match for different simple events", () => {
    expect(matches_activation_event("on_startup", "on_startup_finished")).toBe(
      false,
    );
    expect(matches_activation_event("on_startup", "on_settings_open")).toBe(
      false,
    );
  });

  it("exact match for on_command", () => {
    expect(
      matches_activation_event("on_command:my-cmd", "on_command:my-cmd"),
    ).toBe(true);
    expect(
      matches_activation_event("on_command:my-cmd", "on_command:other"),
    ).toBe(false);
  });

  it("on_file_type matches case-insensitively", () => {
    expect(
      matches_activation_event("on_file_type:bib", "on_file_type:bib"),
    ).toBe(true);
    expect(
      matches_activation_event("on_file_type:BIB", "on_file_type:bib"),
    ).toBe(true);
    expect(
      matches_activation_event("on_file_type:csv", "on_file_type:CSV"),
    ).toBe(true);
  });

  it("on_file_type does not match different extensions", () => {
    expect(
      matches_activation_event("on_file_type:bib", "on_file_type:csv"),
    ).toBe(false);
  });

  it("vault_contains matches exact path", () => {
    expect(
      matches_activation_event(
        "vault_contains:.zotero-connector",
        "vault_contains:.zotero-connector",
      ),
    ).toBe(true);
  });

  it("vault_contains matches file at end of path", () => {
    expect(
      matches_activation_event(
        "vault_contains:.zotero-connector",
        "vault_contains:some/dir/.zotero-connector",
      ),
    ).toBe(true);
  });

  it("vault_contains matches dot-prefixed files by extension-like suffix", () => {
    expect(
      matches_activation_event(
        "vault_contains:.bib",
        "vault_contains:references/main.bib",
      ),
    ).toBe(true);
  });

  it("vault_contains does not match unrelated paths", () => {
    expect(
      matches_activation_event(
        "vault_contains:.zotero-connector",
        "vault_contains:notes/readme.md",
      ),
    ).toBe(false);
  });
});

describe("should_activate_for_events", () => {
  it("returns true for on_startup when no events declared", () => {
    expect(should_activate_for_events(undefined, "on_startup")).toBe(true);
    expect(should_activate_for_events([], "on_startup")).toBe(true);
  });

  it("returns false for non-startup events when no events declared", () => {
    expect(should_activate_for_events(undefined, "on_startup_finished")).toBe(
      false,
    );
    expect(should_activate_for_events(undefined, "on_file_type:bib")).toBe(
      false,
    );
  });

  it("matches declared on_startup_finished", () => {
    expect(
      should_activate_for_events(
        ["on_startup_finished"],
        "on_startup_finished",
      ),
    ).toBe(true);
  });

  it("matches declared on_file_type", () => {
    expect(
      should_activate_for_events(["on_file_type:csv"], "on_file_type:csv"),
    ).toBe(true);
  });

  it("matches declared vault_contains", () => {
    expect(
      should_activate_for_events(
        ["vault_contains:.zotero-connector"],
        "vault_contains:path/to/.zotero-connector",
      ),
    ).toBe(true);
  });

  it("returns false when no declared event matches", () => {
    expect(should_activate_for_events(["on_file_type:bib"], "on_startup")).toBe(
      false,
    );
  });

  it("supports multiple declared events", () => {
    const events = [
      "on_file_type:bib",
      "on_file_type:csv",
      "on_startup_finished",
    ] as const;
    expect(should_activate_for_events([...events], "on_file_type:csv")).toBe(
      true,
    );
    expect(should_activate_for_events([...events], "on_startup_finished")).toBe(
      true,
    );
    expect(should_activate_for_events([...events], "on_startup")).toBe(false);
  });
});

describe("extract_file_extension", () => {
  it("extracts extension from simple filenames", () => {
    expect(extract_file_extension("note.md")).toBe("md");
    expect(extract_file_extension("data.csv")).toBe("csv");
    expect(extract_file_extension("refs.bib")).toBe("bib");
  });

  it("extracts extension from paths", () => {
    expect(extract_file_extension("folder/subfolder/note.md")).toBe("md");
  });

  it("normalizes to lowercase", () => {
    expect(extract_file_extension("DATA.CSV")).toBe("csv");
    expect(extract_file_extension("Note.MD")).toBe("md");
  });

  it("returns null for no extension", () => {
    expect(extract_file_extension("Makefile")).toBeNull();
    expect(extract_file_extension("noext")).toBeNull();
  });

  it("returns null for trailing dot", () => {
    expect(extract_file_extension("file.")).toBeNull();
  });

  it("handles multiple dots", () => {
    expect(extract_file_extension("archive.tar.gz")).toBe("gz");
  });
});

describe("file_matches_vault_contains", () => {
  it("matches exact path", () => {
    expect(
      file_matches_vault_contains(".zotero-connector", ".zotero-connector"),
    ).toBe(true);
  });

  it("matches file at end of path", () => {
    expect(
      file_matches_vault_contains("dir/.zotero-connector", ".zotero-connector"),
    ).toBe(true);
  });

  it("matches directory prefix", () => {
    expect(file_matches_vault_contains(".obsidian/plugins", ".obsidian")).toBe(
      true,
    );
  });

  it("matches dot-prefixed pattern against filename ending", () => {
    expect(file_matches_vault_contains("refs/main.bib", ".bib")).toBe(true);
  });

  it("does not match unrelated path", () => {
    expect(
      file_matches_vault_contains("notes/readme.md", ".zotero-connector"),
    ).toBe(false);
  });

  it("handles backslash paths", () => {
    expect(
      file_matches_vault_contains(
        "dir\\.zotero-connector",
        ".zotero-connector",
      ),
    ).toBe(true);
  });
});
