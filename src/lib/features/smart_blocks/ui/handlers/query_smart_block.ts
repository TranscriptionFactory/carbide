import { create_logger } from "$lib/shared/utils/logger";
import type { QueryError, QueryResult } from "$lib/features/query";
import { create_reactive_block } from "../reactive_block";
import { render_loading, render_message, render_note_rows } from "../note_rows";
import type {
  SmartBlockContext,
  SmartBlockHandler,
  SmartBlockInstance,
  SmartBlockSpec,
} from "../../ports";

const log = create_logger("query_smart_block");

export type QuerySmartBlockDeps = {
  run_query: (text: string) => Promise<QueryResult>;
};

function parse_error_of(error: unknown): QueryError | null {
  if (!error || typeof error !== "object" || !("query_error" in error)) {
    return null;
  }
  const candidate = (error as { query_error: unknown }).query_error;
  if (
    candidate &&
    typeof candidate === "object" &&
    "message" in candidate &&
    "position" in candidate
  ) {
    return candidate as QueryError;
  }
  return null;
}

function error_text(error: unknown): string {
  const parse_error = parse_error_of(error);
  if (parse_error) {
    return `${parse_error.message} (at position ${String(parse_error.position)})`;
  }
  return error instanceof Error ? error.message : "Query failed";
}

export function create_query_smart_block_handler(
  deps: QuerySmartBlockDeps,
): SmartBlockHandler {
  return {
    type: "query",
    create(spec: SmartBlockSpec, ctx: SmartBlockContext): SmartBlockInstance {
      const dom = document.createElement("div");
      dom.className = "smart-block-results";

      let current_body = spec.body;

      const block = create_reactive_block(ctx, async (is_current) => {
        render_loading(dom);
        try {
          const result = await deps.run_query(current_body);
          if (!is_current()) return;
          if (result.items.length === 0) {
            render_message(dom, "empty", "No results");
          } else {
            render_note_rows(
              dom,
              result.items.map((item) => item.note),
              ctx,
            );
          }
        } catch (error: unknown) {
          if (!is_current()) return;
          if (!parse_error_of(error))
            log.error("Query block failed", { error });
          render_message(dom, "error", error_text(error));
        }
      });

      return {
        dom,
        update(next_spec: SmartBlockSpec) {
          current_body = next_spec.body;
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
