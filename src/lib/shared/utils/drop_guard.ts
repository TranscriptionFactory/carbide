type DropGuardTarget = Pick<Window, "addEventListener" | "removeEventListener">;

export function install_drop_guard(target: DropGuardTarget): () => void {
  const swallow = (event: DragEvent) => {
    event.preventDefault();
  };
  target.addEventListener("dragover", swallow as EventListener);
  target.addEventListener("drop", swallow as EventListener);
  return () => {
    target.removeEventListener("dragover", swallow as EventListener);
    target.removeEventListener("drop", swallow as EventListener);
  };
}
