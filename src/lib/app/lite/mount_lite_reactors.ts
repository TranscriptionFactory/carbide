import { mount_core_reactors, type ReactorContext } from "$lib/reactors";

export function mount_lite_reactors(context: ReactorContext): () => void {
  return mount_core_reactors(context);
}
