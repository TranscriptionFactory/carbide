import { describe, expect, it } from "vitest";
import {
  DEFAULT_HOTKEYS,
  HotkeyService,
  normalize_event_to_key,
} from "$lib/features/hotkey";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";

function mock_event(overrides: Partial<KeyboardEvent>): KeyboardEvent {
  return {
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    key: "a",
    ...overrides,
  } as KeyboardEvent;
}

describe("normalize_event_to_key — shifted punctuation", () => {
  it("normalizes Cmd+Shift+Backquote to the backtick base key", () => {
    const key = normalize_event_to_key(
      mock_event({
        metaKey: true,
        shiftKey: true,
        key: "~",
        code: "Backquote",
      }),
    );
    expect(key).toBe("CmdOrCtrl+Shift+`");
  });

  it("normalizes plain Cmd+Backquote without shift", () => {
    const key = normalize_event_to_key(
      mock_event({ metaKey: true, key: "`", code: "Backquote" }),
    );
    expect(key).toBe("CmdOrCtrl+`");
  });

  it("normalizes Cmd+Shift+Period", () => {
    const key = normalize_event_to_key(
      mock_event({ metaKey: true, shiftKey: true, key: ">", code: "Period" }),
    );
    expect(key).toBe("CmdOrCtrl+Shift+.");
  });

  it("normalizes Cmd+Shift+Slash", () => {
    const key = normalize_event_to_key(
      mock_event({ metaKey: true, shiftKey: true, key: "?", code: "Slash" }),
    );
    expect(key).toBe("CmdOrCtrl+Shift+/");
  });

  it("normalizes Cmd+Shift+BracketLeft", () => {
    const key = normalize_event_to_key(
      mock_event({
        metaKey: true,
        shiftKey: true,
        key: "{",
        code: "BracketLeft",
      }),
    );
    expect(key).toBe("CmdOrCtrl+Shift+[");
  });

  it("leaves shifted letters untouched", () => {
    const key = normalize_event_to_key(
      mock_event({ metaKey: true, shiftKey: true, key: "S", code: "KeyS" }),
    );
    expect(key).toBe("CmdOrCtrl+Shift+S");
  });
});

describe("terminal toggle vs last-used tab bindings", () => {
  const service = new HotkeyService({} as never, {} as never, () => 0);
  const config = service.merge_config(DEFAULT_HOTKEYS, []);

  const terminal_key = normalize_event_to_key(
    mock_event({ metaKey: true, shiftKey: true, key: "~", code: "Backquote" }),
  );
  const last_tab_key = normalize_event_to_key(
    mock_event({ metaKey: true, key: "`", code: "Backquote" }),
  );

  it("normalized events match their declared bindings", () => {
    const terminal_matches = config.bindings.filter(
      (binding) => binding.key === terminal_key,
    );
    expect(terminal_matches.map((binding) => binding.action_id)).toEqual([
      ACTION_IDS.terminal_toggle,
    ]);

    const last_tab_matches = config.bindings.filter(
      (binding) => binding.key === last_tab_key,
    );
    expect(last_tab_matches.map((binding) => binding.action_id)).toEqual([
      ACTION_IDS.tab_go_to_last_used,
    ]);
  });

  it("does not shadow one another", () => {
    expect(terminal_key).not.toBe(last_tab_key);
    expect(
      service.detect_conflict(
        terminal_key,
        "capture",
        ACTION_IDS.terminal_toggle,
        config,
      ),
    ).toBeNull();
    expect(
      service.detect_conflict(
        last_tab_key,
        "capture",
        ACTION_IDS.tab_go_to_last_used,
        config,
      ),
    ).toBeNull();
  });
});
