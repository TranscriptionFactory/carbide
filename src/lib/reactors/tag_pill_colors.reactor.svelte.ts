import type { TagService, TagStore } from "$lib/features/tags";
import type { VaultStore } from "$lib/features/vault";
import { apply_tag_pill_colors } from "$lib/shared/utils/apply_tag_pill_colors";

export function create_tag_pill_colors_reactor(
  tag_store: TagStore,
  vault_store: VaultStore,
  tag_service: TagService,
): () => void {
  return $effect.root(() => {
    $effect(() => {
      const vault_id = vault_store.vault?.id;
      if (vault_id) void tag_service.load_tag_colors();
    });

    $effect(() => {
      apply_tag_pill_colors(tag_store.tag_colors);
    });
  });
}
