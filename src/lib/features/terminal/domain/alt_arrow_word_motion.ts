export function alt_arrow_word_motion(
  e: KeyboardEvent,
): "\x1bb" | "\x1bf" | null {
  if (e.type !== "keydown") return null;
  if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return null;
  if (e.key === "ArrowLeft") return "\x1bb";
  if (e.key === "ArrowRight") return "\x1bf";
  return null;
}
