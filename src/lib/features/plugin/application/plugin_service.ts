import type { PluginStore } from "../state/plugin_store.svelte";
import type {
  ActivationEvent,
  PluginHostPort,
  PluginNotificationPort,
  SidebarView,
  StatusBarItem,
  RibbonIcon,
  PluginSettingsTab,
  PluginEventType,
  SlashCommandContribution,
} from "../ports";
import type { CommandDefinition } from "$lib/features/search";
import type { VaultStore } from "$lib/features/vault";
import type {
  PluginRpcContext,
  RpcRequest,
  RpcResponse,
} from "./plugin_rpc_handler";
import { PluginRpcHandler } from "./plugin_rpc_handler";
import { PluginErrorTracker } from "./plugin_error_tracker";
import { PluginRateLimiter, RateLimitError } from "../domain/rate_limiter";
import { with_timeout, RpcTimeoutError } from "../domain/rpc_timeout";
import { error_message } from "$lib/shared/utils/error_message";
import { PluginEventBus, type PluginEvent } from "./plugin_event_bus";
import type { PluginSettingsService } from "./plugin_settings_service";
import type { PluginSettingsStore } from "../state/plugin_settings_store.svelte";
import { create_logger } from "$lib/shared/utils/logger";
import { merge_plugin_settings_schema } from "./plugin_settings_schema";
import type { DiagnosticsStore } from "$lib/features/diagnostics";
import type { DiagnosticSource, Diagnostic } from "$lib/features/diagnostics";

const log = create_logger("plugin_service");

export class PluginService {
  private rpc_handler: PluginRpcHandler | null = null;
  private error_tracker = new PluginErrorTracker();
  private rate_limiter = new PluginRateLimiter();
  private notification_port: PluginNotificationPort | null = null;
  private event_bus = new PluginEventBus();
  private settings_service: PluginSettingsService | null = null;
  private iframe_post_message_map = new Map<string, (msg: unknown) => void>();
  private diagnostics_store: DiagnosticsStore | null = null;
  private cleanup_callbacks: ((plugin_id: string) => void)[] = [];
  private unsubscribe_changes: (() => void) | null = null;
  private reload_debounce_timers = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();

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

  initialize_rpc(context: PluginRpcContext) {
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

  set_diagnostics_store(store: DiagnosticsStore) {
    this.diagnostics_store = store;
  }

  on_plugin_cleanup(callback: (plugin_id: string) => void) {
    this.cleanup_callbacks.push(callback);
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

  register_slash_command(
    command: SlashCommandContribution & { plugin_id: string },
  ) {
    this.store.register_slash_command(command);
  }

  unregister_slash_command(id: string) {
    this.store.unregister_slash_command(id);
  }

  async execute_slash_command(
    plugin_id: string,
    command_name: string,
    context: { cursor_position: number; selection?: string },
  ): Promise<{ text?: string } | null> {
    const request: RpcRequest = {
      id: `slash_${Date.now()}`,
      method: "commands.execute_slash",
      params: [command_name, context],
    };
    const response = await this.handle_rpc(plugin_id, request);
    if (response.error) return null;
    const result = response.result as { text?: string } | undefined;
    return result ?? null;
  }

  // Status bar registration
  register_status_bar_item(item: StatusBarItem) {
    this.store.register_status_bar_item(item);
  }

  unregister_status_bar_item(id: string) {
    this.store.unregister_status_bar_item(id);
  }

  update_status_bar_item(id: string, props: Record<string, unknown>) {
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

  get_effective_settings_schema(plugin_id: string) {
    const plugin = this.store.plugins.get(plugin_id);
    if (!plugin) {
      return [];
    }

    return merge_plugin_settings_schema(
      plugin.manifest.contributes?.settings,
      this.store.get_settings_tab(plugin_id)?.settings_schema,
    );
  }

  can_open_settings(plugin_id: string) {
    const plugin = this.store.plugins.get(plugin_id);
    if (!plugin) {
      return false;
    }

    if (this.get_effective_settings_schema(plugin_id).length > 0) {
      return true;
    }

    return (
      plugin.enabled &&
      (this.settings_service?.is_permission_granted(
        plugin_id,
        "settings:register",
      ) ??
        false) &&
      this.should_activate(plugin_id, "on_settings_open")
    );
  }

  async ensure_settings_ready(plugin_id: string) {
    const plugin = this.store.plugins.get(plugin_id);
    if (!plugin || !plugin.enabled || plugin.status !== "idle") {
      return;
    }

    if (
      !this.settings_service?.is_permission_granted(
        plugin_id,
        "settings:register",
      )
    ) {
      return;
    }

    if (!this.should_activate(plugin_id, "on_settings_open")) {
      return;
    }

    await this.load_and_activate(plugin_id);
  }

  // Lifecycle
  async discover() {
    const vault_path = this.vault_store.vault?.path;
    if (!vault_path) return [];

    log.debug("Discovering plugins", { vault_path });
    const discovered = await this.host_port.discover(vault_path);
    if (this.vault_store.vault?.path !== vault_path) {
      return [];
    }

    log.debug("Discovered plugins", { count: discovered.length });

    let settings_changed = false;

    for (const { manifest, path, source } of discovered) {
      const sync_result = this.settings_service?.sync_manifest_entry(
        manifest,
        source,
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

  should_activate(plugin_id: string, event: ActivationEvent): boolean {
    const plugin = this.store.plugins.get(plugin_id);
    if (!plugin) return false;
    const events = plugin.manifest.activation_events;
    if (!events || events.length === 0) return event === "on_startup";
    return events.includes(event);
  }

  async activate_matching(event: ActivationEvent) {
    const plugin_ids = Array.from(this.store.plugins.values())
      .filter(
        (plugin) =>
          plugin.enabled &&
          plugin.status === "idle" &&
          this.should_activate(plugin.manifest.id, event),
      )
      .map((plugin) => plugin.manifest.id);

    for (const plugin_id of plugin_ids) {
      await this.load_and_activate(plugin_id);
    }
  }

  async initialize_active_vault() {
    await this.settings_service?.load();
    await this.discover();
    await this.activate_matching("on_startup");
    await this.start_hot_reload();
  }

  async load_plugin(id: string) {
    const vault_path = this.vault_store.vault?.path;
    if (!vault_path) throw new Error("No active vault");
    await this.host_port.load(vault_path, id);
  }

  async unload_plugin(id: string) {
    await this.host_port.unload(id);
    this.error_tracker.reset(id);
    this.rate_limiter.reset(id);
    this.event_bus.unsubscribe_all(id);
    this.unregister_iframe_messenger(id);
    this.clear_plugin_contributions(id);
  }

  async reload_plugin(id: string) {
    const plugin = this.store.plugins.get(id);
    const vault_path = this.vault_store.vault?.path;
    if (!plugin || !vault_path) return;

    this.store.plugins.set(id, { ...plugin, status: "loading" });
    try {
      await this.unload_plugin(id);
      await this.load_plugin(id);
      if (this.vault_store.vault?.path !== vault_path) {
        return;
      }
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
    for (const scid of this.store.slash_commands
      .filter((c) => c.plugin_id === id)
      .map((c) => c.id)) {
      this.store.unregister_slash_command(scid);
    }
    this.store.unregister_settings_tab(id);
    for (const callback of this.cleanup_callbacks) {
      callback(id);
    }
  }

  async load_and_activate(id: string) {
    const plugin = this.store.plugins.get(id);
    const vault_path = this.vault_store.vault?.path;
    if (!plugin || !plugin.enabled || !vault_path) return;

    this.store.plugins.set(id, { ...plugin, status: "loading" });
    try {
      await this.load_plugin(id);
      if (this.vault_store.vault?.path !== vault_path) {
        return;
      }
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

  async clear_vault_state() {
    for (const plugin of this.store.plugins.values()) {
      if (plugin.status === "idle") {
        continue;
      }

      try {
        await this.unload_plugin(plugin.manifest.id);
      } catch (error) {
        log.from_error("Failed to unload plugin during vault cleanup", error);
      }
    }

    this.store.plugins.clear();
  }

  async clear_active_vault() {
    this.stop_hot_reload();
    this.settings_service?.clear();
    this.rate_limiter.clear_all();
    await this.clear_vault_state();
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

  mark_plugin_crashed(id: string, reason: string) {
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

    try {
      this.rate_limiter.check(id);
    } catch (e) {
      if (e instanceof RateLimitError) {
        return { id: request.id, error: e.message };
      }
      throw e;
    }

    const method = request.method;
    let response: RpcResponse;
    try {
      response = await with_timeout(
        this.rpc_handler.handle_request(id, plugin.manifest, request),
        method,
      );
    } catch (e) {
      if (e instanceof RpcTimeoutError) {
        response = { id: request.id, error: e.message };
      } else {
        throw e;
      }
    }

    if (response.error) {
      const action = this.error_tracker.record_error(id, Date.now());

      if (this.diagnostics_store) {
        const source = `plugin:${id}` as DiagnosticSource;
        const diag: Diagnostic = {
          source,
          severity: "error",
          message: `[${request.method}] ${response.error}`,
          rule_id: request.method,
          line: 0,
          column: 0,
          end_line: 0,
          end_column: 0,
          fixable: false,
        };
        this.diagnostics_store.push(source, `_plugins/${id}`, [diag]);
      }

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
    } else {
      this.error_tracker.record_success(id);
    }

    return response;
  }

  private async start_hot_reload() {
    const vault_path = this.vault_store.vault?.path;
    if (!vault_path) return;

    try {
      await this.host_port.watch(vault_path);
    } catch (e) {
      log.from_error("Failed to start plugin watcher", e);
      return;
    }

    this.unsubscribe_changes = this.host_port.subscribe_plugin_changes(
      (event) => {
        this.debounced_handle_plugin_change(event.plugin_id);
      },
    );
  }

  private stop_hot_reload() {
    if (this.unsubscribe_changes) {
      this.unsubscribe_changes();
      this.unsubscribe_changes = null;
    }
    for (const timer of this.reload_debounce_timers.values()) {
      clearTimeout(timer);
    }
    this.reload_debounce_timers.clear();
    this.host_port.unwatch().catch((e: unknown) => {
      log.from_error("Failed to stop plugin watcher", e);
    });
  }

  private debounced_handle_plugin_change(plugin_id: string) {
    const existing = this.reload_debounce_timers.get(plugin_id);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      this.reload_debounce_timers.delete(plugin_id);
      void this.handle_plugin_change(plugin_id);
    }, 500);
    this.reload_debounce_timers.set(plugin_id, timer);
  }

  private async handle_plugin_change(plugin_id: string) {
    const plugin = this.store.plugins.get(plugin_id);
    log.debug("Plugin file changed, reloading", { plugin_id });

    if (plugin && plugin.status === "active") {
      await this.reload_plugin(plugin_id);
    } else {
      await this.discover();
    }
  }

  destroy() {
    this.stop_hot_reload();
    this.event_bus.destroy();
    this.iframe_post_message_map.clear();
  }
}
