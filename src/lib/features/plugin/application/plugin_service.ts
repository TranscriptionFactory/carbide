import type { PluginStore } from "../state/plugin_store.svelte";
import type { PluginHostPort, SidebarView, StatusBarItem, PluginManifest } from "../ports";
import type { CommandDefinition } from "$lib/features/search/types/command_palette";
import type { VaultStore } from "$lib/features/vault";
import type { RpcRequest, RpcResponse } from "./plugin_rpc_handler";
import { PluginRpcHandler } from "./plugin_rpc_handler";

export class PluginService {
  private rpc_handler: PluginRpcHandler | null = null;

  constructor(
    private store: PluginStore,
    private vault_store: VaultStore,
    private host_port: PluginHostPort,
  ) {}

  /**
   * Late-bound context initialization to avoid circular dependencies during bootstrap.
   */
  initialize_rpc(context: { services: any; stores: any }) {
    this.rpc_handler = new PluginRpcHandler(context);
  }

  // Command registration
  register_command(command: CommandDefinition) {
    this.store.register_command(command);
  }

  unregister_command(id: string) {
    this.store.unregister_command(id);
  }

  // Status bar registration
  register_status_bar_item(item: StatusBarItem) {
    this.store.register_status_bar_item(item);
  }

  unregister_status_bar_item(id: string) {
    this.store.unregister_status_bar_item(id);
  }

  // Sidebar registration
  register_sidebar_view(view: SidebarView) {
    this.store.register_sidebar_view(view);
  }

  unregister_sidebar_view(id: string) {
    this.store.unregister_sidebar_view(id);
  }

  // Lifecycle
  async discover() {
    const vault_path = this.vault_store.vault?.path;
    if (!vault_path) return [];

    const manifests = await this.host_port.discover(vault_path);

    // Update store with discovered plugins
    for (const manifest of manifests) {
      if (!this.store.plugins.has(manifest.id)) {
        this.store.plugins.set(manifest.id, {
          manifest,
          enabled: false,
          status: "idle",
        });
      }
    }

    return manifests;
  }

  async load_plugin(id: string) {
    // Milestone 3
    await this.host_port.load(id);
  }

  async unload_plugin(id: string) {
    // Milestone 3
    await this.host_port.unload(id);
    
    // Cleanup dynamic contributions from this plugin
    const prefix = `${id}:`;
    this.store.commands
      .filter((c) => c.id.startsWith(prefix))
      .forEach((c) => this.unregister_command(c.id));
    
    this.store.status_bar_items
      .filter((i) => i.id.startsWith(prefix))
      .forEach((i) => this.unregister_status_bar_item(i.id));
      
    this.store.sidebar_views
      .filter((v) => v.id.startsWith(prefix))
      .forEach((v) => this.unregister_sidebar_view(v.id));
  }

  async enable_plugin(id: string) {
    const plugin = this.store.plugins.get(id);
    if (!plugin) return;

    plugin.status = "loading";
    try {
      await this.load_plugin(id);
      plugin.enabled = true;
      plugin.status = "active";
    } catch (e) {
      plugin.status = "error";
      plugin.error = e instanceof Error ? e.message : String(e);
    }
  }

  async disable_plugin(id: string) {
    const plugin = this.store.plugins.get(id);
    if (!plugin) return;

    try {
      await this.unload_plugin(id);
      plugin.enabled = false;
      plugin.status = "idle";
    } catch (e) {
      plugin.status = "error";
      plugin.error = e instanceof Error ? e.message : String(e);
    }
  }

  async handle_rpc(id: string, request: RpcRequest): Promise<RpcResponse> {
    const plugin = this.store.plugins.get(id);
    if (!plugin || !this.rpc_handler) {
      return { id: request.id, error: "Plugin or RPC handler not initialized" };
    }

    return this.rpc_handler.handle_request(id, plugin.manifest, request);
  }
}
