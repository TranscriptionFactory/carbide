import type { NoteMeta } from "$lib/shared/types/note";
import type { SmartBlockContext } from "../ports";

export type StateKind = "empty" | "info" | "error";

export function render_loading(
  container: HTMLElement,
  text = "Running…",
): void {
  container.replaceChildren(make_message("smart-block-loading", text));
}

export function render_message(
  container: HTMLElement,
  kind: StateKind,
  text: string,
): void {
  container.replaceChildren(make_message(`smart-block-${kind}`, text));
}

function make_message(class_name: string, text: string): HTMLElement {
  const el = document.createElement("div");
  el.className = class_name;
  el.textContent = text;
  return el;
}

export type SmartBlockRow = {
  note: NoteMeta;
  /** Present on a section row: rendered as `note › heading` and opened there. */
  section?: { heading_path: string; start_line: number };
};

export function render_note_rows(
  container: HTMLElement,
  notes: NoteMeta[],
  ctx: SmartBlockContext,
): void {
  render_rows(
    container,
    notes.map((note) => ({ note })),
    ctx,
  );
}

export function render_rows(
  container: HTMLElement,
  rows: SmartBlockRow[],
  ctx: SmartBlockContext,
): void {
  container.replaceChildren(...rows.map((row) => make_row(row, ctx)));
}

function make_row(
  row_data: SmartBlockRow,
  ctx: SmartBlockContext,
): HTMLElement {
  const { note, section } = row_data;
  const row = document.createElement("div");
  row.className = "smart-block-row";

  const title_el = document.createElement("span");
  title_el.className = "smart-block-title";
  title_el.textContent = section
    ? `${note.title || note.name} › ${section.heading_path}`
    : note.title || note.name;

  const path_el = document.createElement("span");
  path_el.className = "smart-block-path";
  path_el.textContent = note.path;

  row.append(title_el, path_el);
  row.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (section) {
      ctx.open_note(note.path, undefined, section.start_line);
      return;
    }
    ctx.open_note(note.path);
  });
  return row;
}
