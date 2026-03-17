function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function format_note_name(template: string, now: Date): string {
  if (!template) {
    return "";
  }

  return template
    .replace(/%Y/g, String(now.getFullYear()))
    .replace(/%m/g, pad2(now.getMonth() + 1))
    .replace(/%d/g, pad2(now.getDate()))
    .replace(/%H/g, pad2(now.getHours()))
    .replace(/%M/g, pad2(now.getMinutes()))
    .replace(/%S/g, pad2(now.getSeconds()));
}
