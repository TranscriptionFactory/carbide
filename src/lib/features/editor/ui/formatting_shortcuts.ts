import type { FormattingCommand } from "../adapters/formatting_toolbar_commands";

const is_mac =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad|iPod/.test(navigator.platform);

const mod = is_mac ? "Cmd" : "Ctrl";

const shortcuts: Partial<Record<FormattingCommand, string>> = {
  undo: `${mod}+Z`,
  redo: `${mod}+Shift+Z`,
  bold: `${mod}+B`,
  italic: `${mod}+I`,
  strikethrough: `${mod}+Shift+X`,
  code: `${mod}+E`,
  code_block: `${mod}+Shift+E`,
  link: `${mod}+K`,
  heading1: `${mod}+Shift+1`,
  heading2: `${mod}+Shift+2`,
  heading3: `${mod}+Shift+3`,
};

export function shortcut_hint(command: FormattingCommand): string | null {
  return shortcuts[command] ?? null;
}
