import { mount_core_reactors, type CoreReactorContext } from "$lib/reactors";

export function mount_lite_reactors(context: CoreReactorContext): () => void {
  return mount_core_reactors(context);
}
