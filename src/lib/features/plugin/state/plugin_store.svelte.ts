import type {
  PluginInfo,
  StatusBarItem,
  SidebarView,
  RibbonIcon,
  PluginSettingsTab,
  SlashCommandContribution,
} from "../ports";
import type { CommandDefinition } from "$lib/features/search";
import { SvelteMap } from "svelte/reactivity";

export class PluginStore {
  plugins = new SvelteMap<string, PluginInfo>();

  active_plugin_ids = $derived.by(() => {
    return Array.from(this.plugins.entries())
      .filter(([_, info]) => info.enabled && info.status === "active")
      .map(([id]) => id);
  });

  private _commands = new SvelteMap<string, CommandDefinition>();
  private _slash_commands = new SvelteMap<
    string,
    SlashCommandContribution & { plugin_id: string }
  >();
  private _status_bar_items = new SvelteMap<string, StatusBarItem>();
  private _sidebar_views = new SvelteMap<string, SidebarView>();
  private _ribbon_icons = new SvelteMap<string, RibbonIcon>();
  private _settings_tabs = new SvelteMap<string, PluginSettingsTab>();

  get commands(): CommandDefinition[] {
    return Array.from(this._commands.values());
  }

  register_command(command: CommandDefinition) {
    this._commands.set(command.id, command);
  }

  unregister_command(id: string) {
    this._commands.delete(id);
  }

  get slash_commands(): Array<
    SlashCommandContribution & { plugin_id: string }
  > {
    return Array.from(this._slash_commands.values());
  }

  register_slash_command(
    command: SlashCommandContribution & { plugin_id: string },
  ) {
    this._slash_commands.set(command.id, command);
  }

  unregister_slash_command(id: string) {
    this._slash_commands.delete(id);
  }

  status_bar_items = $derived.by(() => {
    return Array.from(this._status_bar_items.values()).sort(
      (a, b) => a.priority - b.priority,
    );
  });

  register_status_bar_item(item: StatusBarItem) {
    this._status_bar_items.set(item.id, item);
  }

  unregister_status_bar_item(id: string) {
    this._status_bar_items.delete(id);
  }

  update_status_bar_item(id: string, props: Record<string, unknown>) {
    const item = this._status_bar_items.get(id);
    if (!item) return;
    this._status_bar_items.set(id, {
      ...item,
      props: { ...item.props, ...props },
    });
  }

  get sidebar_views(): SidebarView[] {
    return Array.from(this._sidebar_views.values());
  }

  register_sidebar_view(view: SidebarView) {
    this._sidebar_views.set(view.id, view);
  }

  unregister_sidebar_view(id: string) {
    this._sidebar_views.delete(id);
  }

  get ribbon_icons(): RibbonIcon[] {
    return Array.from(this._ribbon_icons.values());
  }

  register_ribbon_icon(icon: RibbonIcon) {
    this._ribbon_icons.set(icon.id, icon);
  }

  unregister_ribbon_icon(id: string) {
    this._ribbon_icons.delete(id);
  }

  get settings_tabs(): PluginSettingsTab[] {
    return Array.from(this._settings_tabs.values());
  }

  get_settings_tab(plugin_id: string): PluginSettingsTab | undefined {
    return this._settings_tabs.get(plugin_id);
  }

  register_settings_tab(tab: PluginSettingsTab) {
    this._settings_tabs.set(tab.plugin_id, tab);
  }

  unregister_settings_tab(plugin_id: string) {
    this._settings_tabs.delete(plugin_id);
  }

  reset_registries() {
    this._commands.clear();
    this._slash_commands.clear();
    this._status_bar_items.clear();
    this._sidebar_views.clear();
    this._ribbon_icons.clear();
    this._settings_tabs.clear();
  }
}
