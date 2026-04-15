import type { VaultSettingsPort } from "$lib/features/vault";
import type { VaultStore } from "$lib/features/vault";
import type { TabStore } from "$lib/features/tab/state/tab_store.svelte";
import type { NotesStore } from "$lib/features/note";
import type { NoteService } from "$lib/features/note";
import type { Tab, PersistedTabState } from "$lib/features/tab/types/tab";
import type { NotePath, VaultId } from "$lib/shared/types/ids";
import { note_name_from_path } from "$lib/shared/utils/path";
import { create_logger } from "$lib/shared/utils/logger";
import { GRAPH_TAB_ID, GRAPH_TAB_TITLE } from "$lib/features/graph";

const log = create_logger("tab_service");
const TABS_KEY = "open_tabs";

export class TabService {
  constructor(
    private readonly vault_settings_port: VaultSettingsPort,
    private readonly vault_store: VaultStore,
    private readonly tab_store: TabStore,
    private readonly notes_store: NotesStore,
    private readonly note_service: NoteService,
  ) {}

  private get_active_vault_id(): VaultId | null {
    return this.vault_store.vault?.id ?? null;
  }

  private list_known_note_paths(): Set<string> {
    return new Set(this.notes_store.notes.map((note) => note.path));
  }

  private build_persisted_tabs_state(
    known_paths: Set<string>,
  ): PersistedTabState {
    const persistable_tabs = this.tab_store.tabs.filter((tab) => {
      if (tab.kind === "note") return known_paths.has(tab.note_path);
      return true;
    });

    const active_tab = this.tab_store.active_tab;
    let active_tab_path: string | null = null;
    if (active_tab?.kind === "note") {
      active_tab_path = known_paths.has(active_tab.note_path)
        ? active_tab.note_path
        : null;
    } else if (active_tab?.kind === "document") {
      active_tab_path = active_tab.file_path;
    } else if (active_tab?.kind === "graph") {
      active_tab_path = active_tab.id;
    } else if (active_tab?.kind === "search_graph") {
      active_tab_path = active_tab.id;
    }

    return {
      tabs: persistable_tabs.map((tab) => {
        const snapshot = this.tab_store.get_snapshot(tab.id);
        const base = {
          is_pinned: tab.is_pinned,
          cursor: snapshot?.cursor ?? null,
          ...(tab.pane === "secondary" ? { pane: "secondary" as const } : {}),
        };
        if (tab.kind === "note") {
          return { ...base, kind: "note" as const, note_path: tab.note_path };
        }
        if (tab.kind === "graph") {
          return {
            ...base,
            kind: "graph" as const,
            view_mode: tab.view_mode,
            cursor: null,
          };
        }
        if (tab.kind === "search_graph") {
          return {
            ...base,
            kind: "search_graph" as const,
            query: tab.query,
            cursor: null,
          };
        }
        return {
          ...base,
          kind: "document" as const,
          file_path: tab.file_path,
          file_type: tab.file_type,
        };
      }),
      active_tab_path,
      active_pane: this.tab_store.active_pane,
    };
  }

  private restore_cursor_snapshots(
    tabs: Tab[],
    persisted_tabs: PersistedTabState["tabs"],
  ): void {
    for (const persisted_tab of persisted_tabs) {
      if (!persisted_tab.cursor) continue;

      const tab =
        persisted_tab.kind === "note"
          ? tabs.find(
              (t) =>
                t.kind === "note" && t.note_path === persisted_tab.note_path,
            )
          : persisted_tab.kind === "document"
            ? tabs.find(
                (t) =>
                  t.kind === "document" &&
                  t.file_path === persisted_tab.file_path,
              )
            : undefined;

      if (!tab) continue;

      this.tab_store.set_snapshot(tab.id, {
        scroll_top: 0,
        cursor: persisted_tab.cursor,
        cursor_offset: 0,
        markdown_cursor_offset: 0,
      });
    }
  }

  private resolve_active_tab_id(
    tabs: Tab[],
    active_tab_path: string | null,
  ): string | null {
    if (active_tab_path && tabs.some((tab) => tab.id === active_tab_path)) {
      return active_tab_path;
    }
    return tabs[0]?.id ?? null;
  }

  async save_tabs(): Promise<void> {
    const vault_id = this.get_active_vault_id();
    if (!vault_id) return;

    const known_paths = this.list_known_note_paths();
    const state = this.build_persisted_tabs_state(known_paths);

    try {
      await this.vault_settings_port.set_local_setting(
        vault_id,
        TABS_KEY,
        state,
      );
    } catch (error) {
      log.error("Save tabs failed", { error });
    }
  }

  sync_dirty_state(tab_id: string, is_dirty: boolean) {
    this.tab_store.set_dirty(tab_id, is_dirty);
  }

  mark_conflict(note_path: NotePath) {
    this.tab_store.mark_conflict(note_path);
  }

  clear_conflict(note_path: NotePath) {
    this.tab_store.clear_conflict(note_path);
  }

  has_conflict(note_path: NotePath): boolean {
    return this.tab_store.has_conflict(note_path);
  }

  invalidate_cache(note_path: NotePath) {
    this.tab_store.invalidate_cache_by_path(note_path);
  }

  remove_tab(note_path: NotePath) {
    this.tab_store.remove_tab_by_path(note_path);
  }

  async load_tabs(): Promise<PersistedTabState | null> {
    const vault_id = this.get_active_vault_id();
    if (!vault_id) return null;

    try {
      const stored =
        await this.vault_settings_port.get_local_setting<PersistedTabState>(
          vault_id,
          TABS_KEY,
        );
      if (!stored || !Array.isArray(stored.tabs)) {
        return null;
      }
      return stored;
    } catch (error) {
      log.error("Load tabs failed", { error });
      return null;
    }
  }

  async restore_tabs(persisted: PersistedTabState): Promise<void> {
    const restored_tabs: Tab[] = persisted.tabs.flatMap((t): Tab[] => {
      const pane = t.pane ?? "primary";
      if (t.kind === "graph") {
        return [
          {
            kind: "graph" as const,
            id: GRAPH_TAB_ID,
            view_mode: "vault" as const,
            title: GRAPH_TAB_TITLE,
            is_pinned: Boolean(t.is_pinned),
            is_dirty: false,
            pane,
          },
        ];
      }
      if (t.kind === "search_graph") {
        const tab_id = `__search_graph__${crypto.randomUUID().slice(0, 8)}__`;
        return [
          {
            kind: "search_graph" as const,
            id: tab_id,
            query: t.query,
            title: `Search: ${t.query}`,
            is_pinned: Boolean(t.is_pinned),
            is_dirty: false,
            pane,
          },
        ];
      }
      if (t.kind === "document") {
        if (typeof t.file_path !== "string") return [];
        return [
          {
            kind: "document" as const,
            id: t.file_path,
            file_path: t.file_path,
            file_type: t.file_type ?? "",
            title: t.file_path.split("/").pop() ?? t.file_path,
            is_pinned: Boolean(t.is_pinned),
            is_dirty: false,
            pane,
          },
        ];
      }
      if (typeof t.note_path !== "string" || !t.note_path.endsWith(".md")) {
        return [];
      }
      return [
        {
          kind: "note" as const,
          id: t.note_path,
          note_path: t.note_path,
          title: note_name_from_path(t.note_path),
          is_pinned: Boolean(t.is_pinned),
          is_dirty: false,
          pane,
        },
      ];
    });

    if (restored_tabs.length === 0) return;

    const active_id = this.resolve_active_tab_id(
      restored_tabs,
      persisted.active_tab_path,
    );
    this.tab_store.restore_tabs(restored_tabs, active_id);
    if (persisted.active_pane) {
      this.tab_store.set_active_pane(persisted.active_pane);
    }
    this.restore_cursor_snapshots(restored_tabs, persisted.tabs);

    if (!active_id) return;

    const active_tab = restored_tabs.find((tab) => tab.id === active_id);
    if (!active_tab) return;
    if (active_tab.kind === "graph") return;
    if (active_tab.kind === "search_graph") return;
    if (active_tab.kind !== "note") return;

    const result = await this.note_service.open_note(
      active_tab.note_path,
      false,
    );
    if (result.status === "not_found") {
      this.tab_store.remove_tab_by_path(active_tab.note_path);
    }
  }
}
