import { create_logger } from "$lib/shared/utils/logger";
import type { VaultId } from "$lib/shared/types/ids";
import type { NoteLinksSnapshot } from "$lib/features/search";
import { create_reactive_block } from "../reactive_block";
import { render_loading, render_message, render_note_rows } from "../note_rows";
import type {
  SmartBlockContext,
  SmartBlockHandler,
  SmartBlockInstance,
  SmartBlockSpec,
} from "../../ports";

const log = create_logger("backlinks_smart_block");

export type BacklinksSmartBlockDeps = {
  get_links: (
    vault_id: VaultId,
    note_path: string,
  ) => Promise<NoteLinksSnapshot>;
};

type LinkKind = "backlinks" | "outlinks";

const EMPTY_LABEL: Record<LinkKind, string> = {
  backlinks: "No backlinks",
  outlinks: "No outgoing links",
};

function parse_kind(body: string): LinkKind {
  const value = body.match(/^\s*show\s*:\s*(\w+)/im)?.[1]?.toLowerCase();
  return value === "outlinks" ? "outlinks" : "backlinks";
}

export function create_backlinks_smart_block_handler(
  deps: BacklinksSmartBlockDeps,
): SmartBlockHandler {
  return {
    type: "backlinks",
    create(spec: SmartBlockSpec, ctx: SmartBlockContext): SmartBlockInstance {
      const dom = document.createElement("div");
      dom.className = "smart-block-results";

      let kind = parse_kind(spec.body);

      const block = create_reactive_block(ctx, async (is_current) => {
        const { vault_id, note_path } = ctx;
        if (!vault_id || !note_path) {
          render_message(dom, "info", "Save note to see backlinks");
          return;
        }
        render_loading(dom);
        try {
          const snapshot = await deps.get_links(vault_id, note_path);
          if (!is_current()) return;
          const notes =
            kind === "outlinks" ? snapshot.outlinks : snapshot.backlinks;
          if (notes.length === 0) {
            render_message(dom, "empty", EMPTY_LABEL[kind]);
          } else {
            render_note_rows(dom, notes, ctx);
          }
        } catch (error: unknown) {
          if (!is_current()) return;
          log.error("Backlinks block failed", { error });
          render_message(
            dom,
            "error",
            error instanceof Error ? error.message : "Failed to load links",
          );
        }
      });

      return {
        dom,
        update(next_spec: SmartBlockSpec) {
          kind = parse_kind(next_spec.body);
          block.schedule();
        },
        destroy() {
          block.destroy();
          dom.remove();
        },
      };
    },
  };
}
