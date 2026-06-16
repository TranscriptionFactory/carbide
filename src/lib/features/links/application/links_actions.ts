import type { ActionRegistry } from "$lib/app/action_registry/action_registry";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import type { EditorService } from "$lib/features/editor";
import type { LinksService } from "$lib/features/links/application/links_service";

export function register_links_actions(
  registry: ActionRegistry,
  editor_service: EditorService,
  links_service: LinksService,
): void {
  registry.register({
    id: ACTION_IDS.links_insert_suggested_link,
    label: "Insert Suggested Link",
    execute: (title: unknown) => {
      if (typeof title === "string") {
        editor_service.insert_text(`[[${title}]]`);
      }
    },
  });

  registry.register({
    id: ACTION_IDS.links_link_unlinked_mention,
    label: "Link Unlinked Mention",
    execute: async (mention_path: unknown, title: unknown) => {
      if (typeof mention_path === "string" && typeof title === "string") {
        await links_service.link_mention(mention_path, title);
      }
    },
  });
}
