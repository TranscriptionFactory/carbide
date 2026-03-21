import type { AppContext } from "$lib/app/di/create_app_context";
import type {
  PluginManifest,
  PluginEventType,
  PluginSettingsTab,
} from "../ports";
import { as_markdown_text, as_note_path } from "$lib/shared/types/ids";
import PluginStatusBarItem from "../ui/plugin_status_bar_item.svelte";
import PluginSidebarPanel from "../ui/plugin_sidebar_panel.svelte";
import { toast } from "svelte-sonner";
import type { PluginEventBus } from "./plugin_event_bus";
import type { PluginSettingsService } from "./plugin_settings_service";

export interface RpcRequest {
  id: string;
  method: string;
  params: any[];
}

export interface RpcResponse {
  id: string;
  result?: any;
  error?: string;
}

export class PluginRpcHandler {
  private event_bus: PluginEventBus | null = null;
  private settings_service: PluginSettingsService | null = null;

  constructor(
    private readonly context: {
      services: AppContext["services"];
      stores: AppContext["stores"];
    },
  ) {}

  set_event_bus(event_bus: PluginEventBus) {
    this.event_bus = event_bus;
  }

  set_settings_service(settings_service: PluginSettingsService) {
    this.settings_service = settings_service;
  }

  async handle_request(
    plugin_id: string,
    manifest: PluginManifest,
    request: RpcRequest,
  ): Promise<RpcResponse> {
    const { method, params, id } = request;

    try {
      const result = await this.dispatch(plugin_id, manifest, method, params);
      return { id, result };
    } catch (e) {
      return {
        id,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  private async dispatch(
    plugin_id: string,
    manifest: PluginManifest,
    method: string,
    params: any[],
  ): Promise<any> {
    const parts = method.split(".");
    const namespace = parts[0];
    const action = parts[1];

    if (!namespace || !action) {
      throw new Error(`Invalid method format: ${method}`);
    }

    switch (namespace) {
      case "vault":
        return this.handle_vault(manifest, action, params);
      case "editor":
        return this.handle_editor(manifest, action, params);
      case "commands":
        return this.handle_commands(plugin_id, manifest, action, params);
      case "ui":
        return this.handle_ui(plugin_id, manifest, action, params);
      case "settings":
        return this.handle_settings(plugin_id, manifest, action, params);
      case "events":
        return this.handle_events(plugin_id, manifest, action, params);
      default:
        throw new Error(`Unknown namespace: ${namespace}`);
    }
  }

  private async handle_vault(
    manifest: PluginManifest,
    action: string,
    params: any[],
  ): Promise<any> {
    if (
      !manifest.permissions.includes("fs:read") &&
      !manifest.permissions.includes("fs:write")
    ) {
      throw new Error("Missing vault permissions (fs:read or fs:write)");
    }

    switch (action) {
      case "read":
        return (this.context.services.note as any).read_note(
          as_note_path(params[0]),
        );
      case "create":
        if (!manifest.permissions.includes("fs:write"))
          throw new Error("Missing fs:write permission");
        return (this.context.services.note as any).create_note(
          as_note_path(params[0]),
          as_markdown_text(params[1] ?? ""),
        );
      case "modify":
        if (!manifest.permissions.includes("fs:write"))
          throw new Error("Missing fs:write permission");
        return (this.context.services.note as any).write_note(
          as_note_path(params[0]),
          as_markdown_text(params[1]),
        );
      case "delete":
        if (!manifest.permissions.includes("fs:write"))
          throw new Error("Missing fs:write permission");
        // Simplified delete
        const meta = this.context.stores.notes.notes.find(
          (n) => n.path === params[0],
        );
        if (!meta) throw new Error("Note not found");
        return this.context.services.note.delete_note(meta);
      case "list":
        return this.context.stores.notes.notes.map((n) => n.path);
      default:
        throw new Error(`Unknown vault action: ${action}`);
    }
  }

  private async handle_editor(
    manifest: PluginManifest,
    action: string,
    params: any[],
  ): Promise<any> {
    if (
      !manifest.permissions.includes("editor:read") &&
      !manifest.permissions.includes("editor:modify")
    ) {
      throw new Error(
        "Missing editor permissions (editor:read or editor:modify)",
      );
    }

    const open_note = this.context.stores.editor.open_note;
    if (!open_note) throw new Error("No active editor");

    switch (action) {
      case "get_value":
        return open_note.markdown;
      case "set_value":
        if (!manifest.permissions.includes("editor:modify"))
          throw new Error("Missing editor:modify permission");
        this.context.services.editor.apply_ai_output(
          "full_note",
          params[0],
          null,
        );
        return { success: true };
      case "get_selection":
        const ctx = this.context.services.editor.get_ai_context();
        return ctx?.selection?.text ?? "";
      case "replace_selection":
        if (!manifest.permissions.includes("editor:modify"))
          throw new Error("Missing editor:modify permission");
        const snapshot =
          this.context.services.editor.get_ai_context()?.selection;
        this.context.services.editor.apply_ai_output(
          "selection",
          params[0],
          snapshot ?? null,
        );
        return { success: true };
      default:
        throw new Error(`Unknown editor action: ${action}`);
    }
  }

  private async handle_commands(
    plugin_id: string,
    manifest: PluginManifest,
    action: string,
    params: any[],
  ): Promise<any> {
    if (!manifest.permissions.includes("commands:register")) {
      throw new Error("Missing commands:register permission");
    }

    switch (action) {
      case "register":
        const command = params[0];
        command.id = `${plugin_id}:${command.id}`;
        this.context.services.plugin.register_command(command);
        return { success: true };
      case "remove": {
        const namespaced_id = `${plugin_id}:${params[0]}`;
        this.context.services.plugin.unregister_command(namespaced_id);
        return { success: true };
      }
      default:
        throw new Error(`Unknown commands action: ${action}`);
    }
  }

  private async handle_ui(
    plugin_id: string,
    manifest: PluginManifest,
    action: string,
    params: any[],
  ): Promise<any> {
    switch (action) {
      case "add_statusbar_item":
        if (!manifest.permissions.includes("ui:statusbar"))
          throw new Error("Missing ui:statusbar permission");
        const { id, priority, initial_text } = params[0];
        const namespaced_id = `${plugin_id}:${id}`;
        this.context.services.plugin.register_status_bar_item({
          id: namespaced_id,
          priority,
          component: PluginStatusBarItem,
          props: { id: namespaced_id, text: initial_text },
        });
        return { success: true };
      case "update_statusbar_item":
        if (!manifest.permissions.includes("ui:statusbar"))
          throw new Error("Missing ui:statusbar permission");
        const target_id = `${plugin_id}:${params[0]}`;
        this.context.services.plugin.update_status_bar_item(target_id, {
          text: params[1],
        });
        return { success: true };
      case "remove_statusbar_item": {
        if (!manifest.permissions.includes("ui:statusbar"))
          throw new Error("Missing ui:statusbar permission");
        const remove_id = `${plugin_id}:${params[0]}`;
        this.context.services.plugin.unregister_status_bar_item(remove_id);
        return { success: true };
      }
      case "add_sidebar_panel": {
        if (!manifest.permissions.includes("ui:panel"))
          throw new Error("Missing ui:panel permission");
        const { id: panel_id, label, icon } = params[0];
        const namespaced_panel_id = `${plugin_id}:${panel_id}`;
        this.context.services.plugin.register_sidebar_view({
          id: namespaced_panel_id,
          label,
          icon,
          panel: PluginSidebarPanel,
        });
        return { success: true };
      }
      case "remove_sidebar_panel": {
        if (!manifest.permissions.includes("ui:panel"))
          throw new Error("Missing ui:panel permission");
        const remove_panel_id = `${plugin_id}:${params[0]}`;
        this.context.services.plugin.unregister_sidebar_view(remove_panel_id);
        return { success: true };
      }
      case "show_notice": {
        const { message, duration } = params[0] ?? {};
        if (!message) throw new Error("Missing message parameter");
        toast.info(message, { duration: duration ?? 4000 });
        return { success: true };
      }
      case "add_ribbon_icon": {
        if (!manifest.permissions.includes("ui:ribbon"))
          throw new Error("Missing ui:ribbon permission");
        const {
          id: ribbon_id,
          icon: ribbon_icon,
          tooltip,
          command: cmd_id,
        } = params[0];
        const namespaced_ribbon_id = `${plugin_id}:${ribbon_id}`;
        this.context.services.plugin.register_ribbon_icon({
          id: namespaced_ribbon_id,
          icon: ribbon_icon,
          tooltip,
          command: `${plugin_id}:${cmd_id}`,
        });
        return { success: true };
      }
      case "remove_ribbon_icon": {
        if (!manifest.permissions.includes("ui:ribbon"))
          throw new Error("Missing ui:ribbon permission");
        const remove_ribbon_id = `${plugin_id}:${params[0]}`;
        this.context.services.plugin.unregister_ribbon_icon(remove_ribbon_id);
        return { success: true };
      }
      default:
        throw new Error(`Unknown ui action: ${action}`);
    }
  }

  private async handle_settings(
    plugin_id: string,
    manifest: PluginManifest,
    action: string,
    params: any[],
  ): Promise<any> {
    if (!this.settings_service) {
      throw new Error("Settings service not initialized");
    }

    switch (action) {
      case "get":
        return this.settings_service.get_setting(plugin_id, params[0]);
      case "set":
        await this.settings_service.set_setting(
          plugin_id,
          params[0],
          params[1],
        );
        return { success: true };
      case "get_all":
        return this.settings_service.get_all_settings(plugin_id);
      case "register_tab": {
        if (!manifest.permissions.includes("settings:register")) {
          throw new Error("Missing settings:register permission");
        }
        const { label, icon } = params[0] ?? {};
        const tab: PluginSettingsTab = {
          plugin_id,
          label: label ?? manifest.name,
          icon,
        };
        this.context.services.plugin.register_settings_tab(tab);
        return { success: true };
      }
      default:
        throw new Error(`Unknown settings action: ${action}`);
    }
  }

  private async handle_events(
    plugin_id: string,
    manifest: PluginManifest,
    action: string,
    params: any[],
  ): Promise<any> {
    if (!manifest.permissions.includes("events:subscribe")) {
      throw new Error("Missing events:subscribe permission");
    }

    if (!this.event_bus) {
      throw new Error("Event bus not initialized");
    }

    switch (action) {
      case "on": {
        const event_type = params[0] as PluginEventType;
        const callback_id = params[1] as string;
        this.event_bus.subscribe(plugin_id, event_type, callback_id);
        return { success: true };
      }
      case "off": {
        const callback_id = params[0] as string;
        this.event_bus.unsubscribe(plugin_id, callback_id);
        return { success: true };
      }
      default:
        throw new Error(`Unknown events action: ${action}`);
    }
  }
}
