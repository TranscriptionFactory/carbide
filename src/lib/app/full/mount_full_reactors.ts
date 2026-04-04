import { mount_reactors, type FullReactorContext } from "$lib/reactors";

export function mount_full_reactors(context: FullReactorContext): () => void {
  return mount_reactors(context);
}
