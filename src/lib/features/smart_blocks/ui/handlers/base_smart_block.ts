import { mount, unmount } from "svelte";
import { create_logger } from "$lib/shared/utils/logger";
import type { VaultId } from "$lib/shared/types/ids";
import {
  BasesStore,
  BasesEmbed,
  type BaseNoteRow,
  type PropertyInfo,
} from "$lib/features/bases";
import { create_reactive_block } from "../reactive_block";
import {
  parse_base_view_spec,
  serialize_base_view_spec,
  type BaseViewSpec,
} from "../../domain/base_view_spec";
import type {
  SmartBlockContext,
  SmartBlockHandler,
  SmartBlockInstance,
  SmartBlockSpec,
} from "../../ports";

const log = create_logger("base_smart_block");

export type BaseQueryOutcome = {
  rows: BaseNoteRow[];
  available_properties: PropertyInfo[];
};

export type BaseSmartBlockDeps = {
  run_base_query: (
    vault_id: VaultId,
    query: string,
  ) => Promise<BaseQueryOutcome>;
};

function apply_view_config(store: BasesStore, spec: BaseViewSpec): void {
  const primary_group = spec.group_by[0];
  store.active_view_mode = spec.view;
  store.kanban_config = primary_group ? { group_by: primary_group } : null;
  store.tree_config = spec.group_by.length ? { group_by: spec.group_by } : null;
  store.calendar_config = spec.date_property
    ? { date_property: spec.date_property }
    : null;
}

function spec_from_store(store: BasesStore, query: string): BaseViewSpec {
  const group_by =
    store.active_view_mode === "tree"
      ? (store.tree_config?.group_by ?? [])
      : store.kanban_config
        ? [store.kanban_config.group_by]
        : [];
  return {
    view: store.active_view_mode,
    query,
    group_by,
    date_property: store.calendar_config?.date_property ?? null,
  };
}

export function create_base_smart_block_handler(
  deps: BaseSmartBlockDeps,
): SmartBlockHandler {
  return {
    type: "base",
    create(spec: SmartBlockSpec, ctx: SmartBlockContext): SmartBlockInstance {
      const dom = document.createElement("div");
      dom.className = "smart-block-results";

      const store = new BasesStore();
      let query = "";

      const persist = () => {
        ctx.update_body?.(
          serialize_base_view_spec(spec_from_store(store, query)),
        );
      };

      const component = mount(BasesEmbed, {
        target: dom,
        props: {
          store,
          on_note_click: (path: string) => {
            ctx.open_note(path);
          },
          on_config_change: persist,
        },
      });

      const block = create_reactive_block(ctx, async (is_current) => {
        if (!query) return;
        const { vault_id } = ctx;
        if (!vault_id) {
          store.error = "Open a vault to view this base";
          return;
        }
        store.loading = true;
        try {
          const { rows, available_properties } = await deps.run_base_query(
            vault_id,
            query,
          );
          if (!is_current()) return;
          store.available_properties = available_properties;
          store.set_results({ rows, total: rows.length });
          store.error = null;
        } catch (error: unknown) {
          if (!is_current()) return;
          log.error("Base block query failed", { error });
          store.error =
            error instanceof Error ? error.message : "Base query failed";
        } finally {
          if (is_current()) store.loading = false;
        }
      });

      function apply_spec(next: SmartBlockSpec): void {
        const parsed = parse_base_view_spec(next.body);
        if (!parsed.ok) {
          store.error = parsed.error;
          return;
        }
        store.error = null;
        const query_changed = parsed.spec.query !== query;
        query = parsed.spec.query;
        apply_view_config(store, parsed.spec);
        if (query_changed) block.schedule();
      }

      apply_spec(spec);

      return {
        dom,
        update(next_spec: SmartBlockSpec) {
          apply_spec(next_spec);
        },
        destroy() {
          block.destroy();
          void unmount(component);
          dom.remove();
        },
      };
    },
  };
}
