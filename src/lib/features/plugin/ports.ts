import type { CommandDefinition } from "$lib/features/search/types/command_palette";
import type { Component } from "svelte";

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  api_version: string;
  permissions: string[];
}

export interface PluginInfo {
  manifest: PluginManifest;
  enabled: boolean;
  status: "idle" | "loading" | "active" | "error";
  error?: string;
}

export interface PluginHostPort {
  discover(vault_path: string): Promise<PluginManifest[]>;
  load(id: string): Promise<void>;
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
