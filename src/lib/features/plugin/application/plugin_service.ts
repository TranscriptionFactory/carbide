import type { PluginStore } from "../state/plugin_store.svelte";
import type {
  PluginHostPort,
  PluginNotificationPort,
  SidebarView,
  StatusBarItem,
  RibbonIcon,
  PluginSettingsTab,
  PluginEventType,
} from "../ports";
import type { CommandDefinition } from "$lib/features/search";
import type { VaultStore } from "$lib/features/vault";
import type { RpcRequest, RpcResponse } from "./plugin_rpc_handler";
import { PluginRpcHandler } from "./plugin_rpc_handler";
import { PluginErrorTracker } from "./plugin_error_tracker";
import { error_message } from "$lib/shared/utils/error_message";
import { PluginEventBus, type PluginEvent } from "./plugin_event_bus";
import type { PluginSettingsService } from "./plugin_settings_service";
import type { PluginSettingsStore } from "../state/plugin_settings_store.svelte";

export class PluginService {
  private rpc_handler: PluginRpcHandler | null = null;
  private error_tracker = new PluginErrorTracker();
  private notification_port: PluginNotificationPort | null = null;
  private event_bus = new PluginEventBus();
  private settings_service: PluginSettingsService | null = null;
  private iframe_post_message_map = new Map<string, (msg: unknown) => void>();

  constructor(
    private store: PluginStore,
    private vault_store: VaultStore,
    private host_port: PluginHostPort,
    notification_port?: PluginNotificationPort,
  ) {
    this.notification_port = notification_port ?? null;

    this.event_bus.set_event_listener((plugin_id, event) => {
      this.deliver_event(plugin_id, event);
    });
  }

  initialize_rpc(context: { services: any; stores: any }) {
    this.rpc_handler = new PluginRpcHandler(context);
    this.rpc_handler.set_event_bus(this.event_bus);
    if (this.settings_service) {
      this.rpc_handler.set_settings_service(this.settings_service);
    }
  }

  set_settings_service(
    settings_service: PluginSettingsService,
    settings_store: PluginSettingsStore,
  ) {
    this.settings_service = settings_service;
    if (this.rpc_handler) {
      this.rpc_handler.set_settings_service(settings_service);
    }
    this.event_bus.set_permission_checker((plugin_id) => {
      return settings_store.is_permission_granted(
        plugin_id,
        "events:subscribe",
      );
    });
  }

  get_event_bus(): PluginEventBus {
    return this.event_bus;
  }

  register_iframe_messenger(
    plugin_id: string,
    post_message: (msg: unknown) => void,
  ) {
    this.iframe_post_message_map.set(plugin_id, post_message);
  }

  unregister_iframe_messenger(plugin_id: string) {
    this.iframe_post_message_map.delete(plugin_id);
  }

  private deliver_event(plugin_id: string, event: PluginEvent) {
    const post_message = this.iframe_post_message_map.get(plugin_id);
    if (post_message) {
      post_message({
        type: "event",
        event: event.type,
        data: event.data,
        timestamp: event.timestamp,
      });
    }
  }

  emit_plugin_event(type: PluginEventType, data?: unknown) {
    this.event_bus.emit({ type, data, timestamp: Date.now() });
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

  update_status_bar_item(id: string, props: Record<string, any>) {
    this.store.update_status_bar_item(id, props);
  }

  // Sidebar registration
  register_sidebar_view(view: SidebarView) {
    this.store.register_sidebar_view(view);
  }

  unregister_sidebar_view(id: string) {
    this.store.unregister_sidebar_view(id);
  }

  // Ribbon icon registration
  register_ribbon_icon(icon: RibbonIcon) {
    this.store.register_ribbon_icon(icon);
  }

  unregister_ribbon_icon(id: string) {
    this.store.unregister_ribbon_icon(id);
  }

  // Settings tab registration
  register_settings_tab(tab: PluginSettingsTab) {
    this.store.register_settings_tab(tab);
  }

  unregister_settings_tab(plugin_id: string) {
    this.store.unregister_settings_tab(plugin_id);
  }

  // Lifecycle
  async discover() {
    const vault_path = this.vault_store.vault?.path;
    if (!vault_path) return [];

    console.debug("[PluginService] discovering plugins at:", vault_path);
    const discovered = await this.host_port.discover(vault_path);
    console.debug("[PluginService] discovered:", discovered.length, "plugins");

    let settings_changed = false;

    for (const { manifest, path } of discovered) {
      const sync_result = this.settings_service?.sync_manifest_entry(
        manifest,
        "local",
      );

      settings_changed = settings_changed || (sync_result?.changed ?? false);

      const existing = this.store.plugins.get(manifest.id);
      const status = existing?.status ?? "idle";

      this.store.plugins.set(manifest.id, {
        manifest,
        path,
        enabled: sync_result?.entry.enabled ?? existing?.enabled ?? false,
        status,
        ...(status === "error" && existing?.error
          ? { error: existing.error }
          : {}),
      });
    }

    if (settings_changed) {
      await this.settings_service?.save();
    }

    return discovered;
  }

  should_activate(plugin_id: string, event: string): boolean {
    const plugin = this.store.plugins.get(plugin_id);
    if (!plugin) return false;
    const events = plugin.manifest.activation_events;
    if (!events || events.length === 0) return event === "on_startup";
    return events.includes(event as any);
  }

  async load_plugin(id: string) {
    const vault_path = this.vault_store.vault?.path;
    if (!vault_path) throw new Error("No active vault");
    await this.host_port.load(vault_path, id);
  }

  async unload_plugin(id: string) {
    await this.host_port.unload(id);
    this.error_tracker.reset(id);
    this.event_bus.unsubscribe_all(id);
    this.unregister_iframe_messenger(id);
    this.clear_plugin_contributions(id);
  }

  async reload_plugin(id: string) {
    const plugin = this.store.plugins.get(id);
    if (!plugin) return;

    this.store.plugins.set(id, { ...plugin, status: "loading" });
    try {
      await this.unload_plugin(id);
      await this.load_plugin(id);
      this.store.plugins.set(id, {
        manifest: plugin.manifest,
        path: plugin.path,
        enabled: plugin.enabled,
        status: "active",
      });
    } catch (e) {
      this.store.plugins.set(id, {
        ...plugin,
        status: "error",
        error: error_message(e),
      });
    }
  }

  private clear_plugin_contributions(id: string) {
    const prefix = `${id}:`;
    for (const cid of this.store.commands
      .filter((c) => c.id.startsWith(prefix))
      .map((c) => c.id)) {
      this.store.unregister_command(cid);
    }
    for (const sid of this.store.status_bar_items
      .filter((i) => i.id.startsWith(prefix))
      .map((i) => i.id)) {
      this.store.unregister_status_bar_item(sid);
    }
    for (const vid of this.store.sidebar_views
      .filter((v) => v.id.startsWith(prefix))
      .map((v) => v.id)) {
      this.store.unregister_sidebar_view(vid);
    }
    for (const rid of this.store.ribbon_icons
      .filter((r) => r.id.startsWith(prefix))
      .map((r) => r.id)) {
      this.store.unregister_ribbon_icon(rid);
    }
    this.store.unregister_settings_tab(id);
  }

  async load_and_activate(id: string) {
    const plugin = this.store.plugins.get(id);
    if (!plugin || !plugin.enabled) return;

    this.store.plugins.set(id, { ...plugin, status: "loading" });
    try {
      await this.load_plugin(id);
      this.store.plugins.set(id, {
        manifest: plugin.manifest,
        path: plugin.path,
        enabled: plugin.enabled,
        status: "active",
      });
    } catch (e) {
      this.store.plugins.set(id, {
        ...plugin,
        status: "error",
        error: error_message(e),
      });
    }
  }

  async unload_then_idle(id: string) {
    const plugin = this.store.plugins.get(id);
    if (!plugin) return;

    try {
      await this.unload_plugin(id);
      this.store.plugins.set(id, { ...plugin, status: "idle" });
    } catch (e) {
      this.store.plugins.set(id, {
        ...plugin,
        status: "error",
        error: error_message(e),
      });
    }
  }

  async enable_plugin(id: string) {
    const plugin = this.store.plugins.get(id);
    if (!plugin) return;

    this.settings_service?.sync_manifest_entry(plugin.manifest, "local");
    this.store.plugins.set(id, { ...plugin, status: "loading" });
    try {
      await this.load_plugin(id);
      await this.settings_service?.set_enabled(id, true);
      this.store.plugins.set(id, {
        ...plugin,
        enabled: true,
        status: "active",
      });
    } catch (e) {
      this.store.plugins.set(id, {
        ...plugin,
        status: "error",
        error: error_message(e),
      });
    }
  }

  async disable_plugin(id: string) {
    const plugin = this.store.plugins.get(id);
    if (!plugin) return;

    try {
      await this.unload_plugin(id);
      await this.settings_service?.set_enabled(id, false);
      this.store.plugins.set(id, { ...plugin, enabled: false, status: "idle" });
    } catch (e) {
      this.store.plugins.set(id, {
        ...plugin,
        status: "error",
        error: error_message(e),
      });
    }
  }

  async mark_plugin_crashed(id: string, reason: string) {
    const plugin = this.store.plugins.get(id);
    if (!plugin) return;

    this.store.plugins.set(id, { ...plugin, status: "error", error: reason });
    this.event_bus.unsubscribe_all(id);
    this.clear_plugin_contributions(id);
    this.error_tracker.reset(id);
  }

  async handle_rpc(id: string, request: RpcRequest): Promise<RpcResponse> {
    const plugin = this.store.plugins.get(id);
    if (!plugin || !this.rpc_handler) {
      return { id: request.id, error: "Plugin or RPC handler not initialized" };
    }

    const response = await this.rpc_handler.handle_request(
      id,
      plugin.manifest,
      request,
    );

    if (response.error) {
      const action = this.error_tracker.record_error(id, Date.now());

      if (action === "auto_disable") {
        this.notification_port?.notify_plugin_auto_disabled(
          id,
          plugin.manifest.name,
        );
        await this.disable_plugin(id);
      } else if (action === "warn_user") {
        this.notification_port?.notify_plugin_unstable(
          id,
          plugin.manifest.name,
        );
      }
    }

    return response;
  }

  destroy() {
    this.event_bus.destroy();
    this.iframe_post_message_map.clear();
  }
}
