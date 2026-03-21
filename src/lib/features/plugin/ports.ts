import type { CommandDefinition } from "$lib/features/search";
import type { Component } from "svelte";

export type ActivationEvent =
  | "on_startup"
  | `on_command:${string}`
  | `on_file_open:${string}`
  | "on_settings_open";

export interface PluginSettingSchema {
  key: string;
  type: "string" | "number" | "boolean" | "select";
  label: string;
  description?: string;
  default?: unknown;
  options?: { label: string; value: string }[];
}

export interface PluginContributes {
  settings?: PluginSettingSchema[];
  ribbon_icons?: {
    id: string;
    icon: string;
    tooltip: string;
    command: string;
  }[];
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  api_version: string;
  permissions: string[];
  activation_events?: ActivationEvent[];
  contributes?: PluginContributes;
}

export interface PluginSettingsData {
  schema_version: number;
  plugins: Record<string, PluginSettingsEntry>;
}

export interface PluginSettingsEntry {
  enabled: boolean;
  version: string;
  source: string;
  permissions_granted: string[];
  permissions_pending: string[];
  settings: Record<string, unknown>;
  content_hash: string | null;
}

export interface PluginSettingsPort {
  read_settings(vault_path: string): Promise<PluginSettingsData>;
  write_settings(
    vault_path: string,
    settings: PluginSettingsData,
  ): Promise<void>;
  approve_permission(
    vault_path: string,
    plugin_id: string,
    permission: string,
  ): Promise<void>;
  deny_permission(
    vault_path: string,
    plugin_id: string,
    permission: string,
  ): Promise<void>;
}

export interface PluginInfo {
  manifest: PluginManifest;
  path: string;
  enabled: boolean;
  status: "idle" | "loading" | "active" | "error";
  error?: string;
}

export type DiscoveredPlugin = Pick<PluginInfo, "manifest" | "path">;

export interface PluginHostPort {
  discover(vault_path: string): Promise<DiscoveredPlugin[]>;
  load(vault_path: string, id: string): Promise<void>;
  unload(id: string): Promise<void>;
}

// Registry types for host contributions
export interface StatusBarItem {
  id: string;
  priority: number;
  component: Component<any>;
  props?: Record<string, any>;
}

export interface SidebarView {
  id: string;
  label: string;
  icon: Component<any>;
  panel: Component<any>;
}

export interface SidebarRegistryPort {
  register(view: SidebarView): void;
  unregister(id: string): void;
  getViews(): SidebarView[];
}

export interface CommandRegistryPort {
  register(command: CommandDefinition): void;
  unregister(id: string): void;
  getCommands(): CommandDefinition[];
}

export interface StatusBarRegistryPort {
  register(item: StatusBarItem): void;
  unregister(id: string): void;
  getItems(): StatusBarItem[];
}

export interface RibbonIcon {
  id: string;
  icon: string;
  tooltip: string;
  command: string;
}

export interface PluginSettingsTab {
  plugin_id: string;
  label: string;
  icon?: string;
}

export type PluginEventType =
  | "file-created"
  | "file-modified"
  | "file-deleted"
  | "file-renamed"
  | "active-file-changed"
  | "editor-selection-changed"
  | "vault-opened"
  | "layout-changed";

export interface PluginNotificationPort {
  notify_plugin_unstable(plugin_id: string, plugin_name: string): void;
  notify_plugin_auto_disabled(plugin_id: string, plugin_name: string): void;
}
