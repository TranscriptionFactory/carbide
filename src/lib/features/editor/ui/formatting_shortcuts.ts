import { format_hotkey_for_display } from "$lib/features/hotkey";
import type { FormattingCommand } from "../adapters/formatting_toolbar_commands";

const shortcuts: Partial<Record<FormattingCommand, string>> = {
  undo: "CmdOrCtrl+Z",
  redo: "CmdOrCtrl+Shift+Z",
  bold: "CmdOrCtrl+B",
  italic: "CmdOrCtrl+I",
  strikethrough: "CmdOrCtrl+Shift+X",
  code: "CmdOrCtrl+E",
  code_block: "CmdOrCtrl+Shift+E",
  link: "CmdOrCtrl+K",
  heading1: "CmdOrCtrl+Shift+1",
  heading2: "CmdOrCtrl+Shift+2",
  heading3: "CmdOrCtrl+Shift+3",
};

export function shortcut_hint(command: FormattingCommand): string | null {
  const raw = shortcuts[command];
  return raw ? format_hotkey_for_display(raw) : null;
}
