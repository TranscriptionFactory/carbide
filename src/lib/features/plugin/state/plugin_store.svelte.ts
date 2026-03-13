import type {
  PluginInfo,
  StatusBarItem,
  SidebarView,
} from "../ports";
import type { CommandDefinition } from "$lib/features/search/types/command_palette";
import { SvelteMap } from "svelte/reactivity";

export class PluginStore {
  // Plugin management state
  plugins = new SvelteMap<string, PluginInfo>();

  active_plugin_ids = $derived.by(() => {
    return Array.from(this.plugins.entries())
      .filter(([_, info]) => info.enabled && info.status === "active")
      .map(([id]) => id);
  });

  // Host registries (Milestone 1)
  private _commands = new SvelteMap<string, CommandDefinition>();
  private _status_bar_items = new SvelteMap<string, StatusBarItem>();
  private _sidebar_views = new SvelteMap<string, SidebarView>();

  // Commands registry
  get commands(): CommandDefinition[] {
    return Array.from(this._commands.values());
  }

  register_command(command: CommandDefinition) {
    this._commands.set(command.id, command);
  }

  unregister_command(id: string) {
    this._commands.delete(id);
  }

  // Status bar registry
  get status_bar_items(): StatusBarItem[] {
    return Array.from(this._status_bar_items.values()).sort(
      (a, b) => a.priority - b.priority,
    );
  }

  register_status_bar_item(item: StatusBarItem) {
    this._status_bar_items.set(item.id, item);
  }

  unregister_status_bar_item(id: string) {
    this._status_bar_items.delete(id);
  }

  // Sidebar registry
  get sidebar_views(): SidebarView[] {
    return Array.from(this._sidebar_views.values());
  }

  register_sidebar_view(view: SidebarView) {
    this._sidebar_views.set(view.id, view);
  }

  unregister_sidebar_view(id: string) {
    this._sidebar_views.delete(id);
  }

  // Utility to clear all (e.g., on vault switch or reset)
  reset_registries() {
    this._commands.clear();
    this._status_bar_items.clear();
    this._sidebar_views.clear();
  }
}
