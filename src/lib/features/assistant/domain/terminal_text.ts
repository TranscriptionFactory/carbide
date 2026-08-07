// OSC first: its introducer byte `]` also falls inside the single-character
// escape range, so the terminated form has to win the alternation.
const ANSI_PATTERN = new RegExp(
  [
    "\\u001B\\][\\s\\S]*?(?:\\u0007|\\u001B\\\\)",
    "\\u001B\\[[0-?]*[ -/]*[@-~]",
    "\\u001B[@-Z\\\\-_]",
  ].join("|"),
  "g",
);

export function strip_ansi(text: string): string {
  return text.replace(ANSI_PATTERN, "");
}

export function render_terminal_text(text: string): string {
  return strip_ansi(text).split("\n").map(collapse_redraws).join("\n");
}

function collapse_redraws(line: string): string {
  const without_crlf_residue = line.replace(/\r+$/, "");
  const last_return = without_crlf_residue.lastIndexOf("\r");
  return last_return === -1
    ? without_crlf_residue
    : without_crlf_residue.slice(last_return + 1);
}
