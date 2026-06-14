import { create_logger } from "$lib/shared/utils/logger";
import type { QueryError, QueryResult } from "$lib/features/query";
import type {
  SmartBlockContext,
  SmartBlockHandler,
  SmartBlockInstance,
  SmartBlockSpec,
} from "../../ports";

const log = create_logger("query_smart_block");

const RERUN_DEBOUNCE_MS = 150;

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

function render_running(container: HTMLElement): void {
  container.innerHTML = '<div class="query-block-loading">Running…</div>';
}

function render_empty(container: HTMLElement): void {
  container.innerHTML = '<div class="query-block-empty">No results</div>';
}

function render_error(container: HTMLElement, error: unknown): void {
  const parse_error = parse_error_of(error);
  container.innerHTML = "";
  const error_el = document.createElement("div");
  error_el.className = "query-block-error";
  if (parse_error) {
    error_el.textContent = `${parse_error.message} (at position ${String(parse_error.position)})`;
  } else {
    error_el.textContent =
      error instanceof Error ? error.message : "Query failed";
  }
  container.appendChild(error_el);
}

function render_results(
  container: HTMLElement,
  result: QueryResult,
  ctx: SmartBlockContext,
): void {
  container.innerHTML = "";
  for (const item of result.items) {
    const row = document.createElement("div");
    row.className = "query-block-row";

    const title_el = document.createElement("span");
    title_el.className = "query-block-title";
    title_el.textContent = item.note.title || item.note.name;

    const path_el = document.createElement("span");
    path_el.className = "query-block-path";
    path_el.textContent = item.note.path;

    row.appendChild(title_el);
    row.appendChild(path_el);
    row.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      ctx.open_note(item.note.path);
    });

    container.appendChild(row);
  }
}

export function create_query_smart_block_handler(
  deps: QuerySmartBlockDeps,
): SmartBlockHandler {
  return {
    type: "query",
    create(spec: SmartBlockSpec, ctx: SmartBlockContext): SmartBlockInstance {
      const dom = document.createElement("div");
      dom.className = "query-block-results";

      let current_body = spec.body;
      let debounce_timer: ReturnType<typeof setTimeout> | undefined;
      let latest_token = 0;

      async function run(): Promise<void> {
        const token = ++latest_token;
        render_running(dom);
        try {
          const result = await deps.run_query(current_body);
          if (token !== latest_token) return;
          if (result.items.length === 0) {
            render_empty(dom);
          } else {
            render_results(dom, result, ctx);
          }
        } catch (error: unknown) {
          if (token !== latest_token) return;
          if (!parse_error_of(error))
            log.error("Query block failed", { error });
          render_error(dom, error);
        }
      }

      function schedule_run(): void {
        clearTimeout(debounce_timer);
        debounce_timer = setTimeout(() => void run(), RERUN_DEBOUNCE_MS);
      }

      const unsubscribe = ctx.subscribe_to_changes(() => schedule_run());

      schedule_run();

      return {
        dom,
        update(next_spec: SmartBlockSpec) {
          current_body = next_spec.body;
          schedule_run();
        },
        destroy() {
          clearTimeout(debounce_timer);
          latest_token++;
          unsubscribe();
          dom.remove();
        },
      };
    },
  };
}
