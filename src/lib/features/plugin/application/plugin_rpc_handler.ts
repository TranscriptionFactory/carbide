import type { CommandDefinition } from "$lib/features/search";
import type {
  PluginManifest,
  PluginEventType,
  PluginSettingsTab,
} from "../ports";
import { Blocks, LayoutDashboard } from "@lucide/svelte";
import { as_markdown_text, as_note_path } from "$lib/shared/types/ids";
import PluginStatusBarItem from "../ui/plugin_status_bar_item.svelte";
import PluginSidebarPanel from "../ui/plugin_sidebar_panel.svelte";
import { toast } from "svelte-sonner";
import type { PluginEventBus } from "./plugin_event_bus";
import type { PluginSettingsService } from "./plugin_settings_service";
import type { PluginService } from "./plugin_service";

export interface RpcRequest {
  id: string;
  method: string;
  params: unknown[];
}

export interface RpcResponse {
  id: string;
  result?: unknown;
  error?: string;
}

type RpcParams = unknown[];
type RpcRecord = Record<string, unknown>;

type PluginRpcNoteService = {
  read_note(note_path: string): Promise<unknown>;
  create_note(note_path: string, markdown: string): Promise<unknown>;
  write_note(note_path: string, markdown: string): Promise<unknown>;
  delete_note(note_path: string): Promise<unknown>;
};

type PluginRpcEditorService = {
  apply_ai_output(
    scope: "full_note" | "selection",
    text: string,
    snapshot: unknown,
  ): void;
  get_ai_context(): {
    selection?: { text?: string | null } | null;
  } | null;
};

type PluginStatusBarItemInput = {
  id: string;
  priority: number;
  initial_text?: string | undefined;
};

type PluginSidebarPanelInput = {
  id: string;
  label: string;
  icon?: string | undefined;
};

type PluginNoticeInput = {
  message: string;
  duration?: number | undefined;
};

type PluginRibbonIconInput = {
  id: string;
  icon: string;
  tooltip: string;
  command: string;
};

type PluginSettingsTabInput = {
  label?: string | undefined;
  icon?: string | undefined;
};

export type PluginRpcContext = {
  services: {
    note: PluginRpcNoteService;
    editor: PluginRpcEditorService;
    plugin: Pick<
      PluginService,
      | "register_command"
      | "unregister_command"
      | "register_status_bar_item"
      | "update_status_bar_item"
      | "unregister_status_bar_item"
      | "register_sidebar_view"
      | "unregister_sidebar_view"
      | "register_ribbon_icon"
      | "unregister_ribbon_icon"
      | "register_settings_tab"
    >;
  };
  stores: {
    notes: { notes: Array<{ path: string }> };
    editor: { open_note: { markdown: string } | null };
  };
};

const SIDEBAR_ICON_COMPONENTS = {
  blocks: Blocks,
  "layout-dashboard": LayoutDashboard,
} satisfies Record<string, typeof Blocks>;

function is_record(value: unknown): value is RpcRecord {
  return typeof value === "object" && value !== null;
}

function read_record(value: unknown, label: string): RpcRecord {
  if (!is_record(value)) {
    throw new Error(`Invalid ${label}`);
  }
  return value;
}

function read_string(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new Error(`Invalid ${label}`);
  }
  return value;
}

function read_optional_string(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function read_number(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Invalid ${label}`);
  }
  return value;
}

function read_optional_number(
  value: unknown,
  label: string,
): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  return read_number(value, label);
}

function read_string_array(value: unknown, label: string): string[] {
  if (
    !Array.isArray(value) ||
    value.some((entry) => typeof entry !== "string")
  ) {
    throw new Error(`Invalid ${label}`);
  }
  return value.map((entry) => read_string(entry, label));
}

function read_param_string(
  params: RpcParams,
  index: number,
  label: string,
): string {
  return read_string(params[index], label);
}

function read_command_definition(input: unknown): CommandDefinition {
  const record = read_record(input, "command");
  return {
    id: read_string(record.id, "command.id") as CommandDefinition["id"],
    label: read_string(record.label, "command.label"),
    description: read_string(record.description, "command.description"),
    keywords: read_string_array(record.keywords, "command.keywords"),
    icon: read_string(record.icon, "command.icon") as CommandDefinition["icon"],
  };
}

function read_status_bar_item_input(input: unknown): PluginStatusBarItemInput {
  const record = read_record(input, "status bar item");
  return {
    id: read_string(record.id, "status bar item id"),
    priority: read_number(record.priority, "status bar item priority"),
    initial_text: read_optional_string(record.initial_text),
  };
}

function read_sidebar_panel_input(input: unknown): PluginSidebarPanelInput {
  const record = read_record(input, "sidebar panel");
  return {
    id: read_string(record.id, "sidebar panel id"),
    label: read_string(record.label, "sidebar panel label"),
    icon: read_optional_string(record.icon),
  };
}

function read_notice_input(input: unknown): PluginNoticeInput {
  const record = read_record(input, "notice");
  const message = read_optional_string(record.message);
  if (!message) {
    throw new Error("Missing message parameter");
  }
  return {
    message,
    duration: read_optional_number(record.duration, "notice duration"),
  };
}

function read_ribbon_icon_input(input: unknown): PluginRibbonIconInput {
  const record = read_record(input, "ribbon icon");
  return {
    id: read_string(record.id, "ribbon icon id"),
    icon: read_string(record.icon, "ribbon icon name"),
    tooltip: read_string(record.tooltip, "ribbon tooltip"),
    command: read_string(record.command, "ribbon command"),
  };
}

function read_settings_tab_input(input: unknown): PluginSettingsTabInput {
  if (input === undefined) {
    return {};
  }

  const record = read_record(input, "settings tab");
  return {
    label: read_optional_string(record.label),
    icon: read_optional_string(record.icon),
  };
}

function resolve_sidebar_icon(icon_name: string | undefined): typeof Blocks {
  if (!icon_name) {
    return Blocks;
  }

  if (icon_name in SIDEBAR_ICON_COMPONENTS) {
    return SIDEBAR_ICON_COMPONENTS[
      icon_name as keyof typeof SIDEBAR_ICON_COMPONENTS
    ];
  }

  return Blocks;
}

export class PluginRpcHandler {
  private event_bus: PluginEventBus | null = null;
  private settings_service: PluginSettingsService | null = null;

  constructor(private readonly context: PluginRpcContext) {}

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

  private dispatch(
    plugin_id: string,
    manifest: PluginManifest,
    method: string,
    params: RpcParams,
  ) {
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

  private handle_vault(
    manifest: PluginManifest,
    action: string,
    params: RpcParams,
  ) {
    if (
      !manifest.permissions.includes("fs:read") &&
      !manifest.permissions.includes("fs:write")
    ) {
      throw new Error("Missing vault permissions (fs:read or fs:write)");
    }

    switch (action) {
      case "read":
        return this.context.services.note.read_note(
          as_note_path(read_param_string(params, 0, "note path")),
        );
      case "create":
        if (!manifest.permissions.includes("fs:write"))
          throw new Error("Missing fs:write permission");
        return this.context.services.note.create_note(
          as_note_path(read_param_string(params, 0, "note path")),
          as_markdown_text(read_string(params[1] ?? "", "markdown")),
        );
      case "modify":
        if (!manifest.permissions.includes("fs:write"))
          throw new Error("Missing fs:write permission");
        return this.context.services.note.write_note(
          as_note_path(read_param_string(params, 0, "note path")),
          as_markdown_text(read_param_string(params, 1, "markdown")),
        );
      case "delete":
        if (!manifest.permissions.includes("fs:write"))
          throw new Error("Missing fs:write permission");
        return this.context.services.note.delete_note(
          read_param_string(params, 0, "note path"),
        );
      case "list":
        return this.context.stores.notes.notes.map((n) => n.path);
      default:
        throw new Error(`Unknown vault action: ${action}`);
    }
  }

  private handle_editor(
    manifest: PluginManifest,
    action: string,
    params: RpcParams,
  ) {
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
      case "set_value": {
        if (!manifest.permissions.includes("editor:modify"))
          throw new Error("Missing editor:modify permission");
        this.context.services.editor.apply_ai_output(
          "full_note",
          read_param_string(params, 0, "editor text"),
          null,
        );
        return { success: true };
      }
      case "get_selection": {
        const ctx = this.context.services.editor.get_ai_context();
        return ctx?.selection?.text ?? "";
      }
      case "replace_selection": {
        if (!manifest.permissions.includes("editor:modify"))
          throw new Error("Missing editor:modify permission");
        const snapshot =
          this.context.services.editor.get_ai_context()?.selection;
        this.context.services.editor.apply_ai_output(
          "selection",
          read_param_string(params, 0, "editor text"),
          snapshot ?? null,
        );
        return { success: true };
      }
      default:
        throw new Error(`Unknown editor action: ${action}`);
    }
  }

  private handle_commands(
    plugin_id: string,
    manifest: PluginManifest,
    action: string,
    params: RpcParams,
  ) {
    if (!manifest.permissions.includes("commands:register")) {
      throw new Error("Missing commands:register permission");
    }

    switch (action) {
      case "register": {
        const command = read_command_definition(params[0]);
        command.id = `${plugin_id}:${command.id}`;
        this.context.services.plugin.register_command(command);
        return { success: true };
      }
      case "remove": {
        const namespaced_id = `${plugin_id}:${read_param_string(params, 0, "command id")}`;
        this.context.services.plugin.unregister_command(namespaced_id);
        return { success: true };
      }
      default:
        throw new Error(`Unknown commands action: ${action}`);
    }
  }

  private handle_ui(
    plugin_id: string,
    manifest: PluginManifest,
    action: string,
    params: RpcParams,
  ) {
    switch (action) {
      case "add_statusbar_item": {
        if (!manifest.permissions.includes("ui:statusbar"))
          throw new Error("Missing ui:statusbar permission");
        const { id, priority, initial_text } = read_status_bar_item_input(
          params[0],
        );
        const namespaced_id = `${plugin_id}:${id}`;
        this.context.services.plugin.register_status_bar_item({
          id: namespaced_id,
          priority,
          component: PluginStatusBarItem,
          props: { id: namespaced_id, text: initial_text ?? "" },
        });
        return { success: true };
      }
      case "update_statusbar_item": {
        if (!manifest.permissions.includes("ui:statusbar"))
          throw new Error("Missing ui:statusbar permission");
        const target_id = `${plugin_id}:${read_param_string(params, 0, "status bar item id")}`;
        this.context.services.plugin.update_status_bar_item(target_id, {
          text: read_param_string(params, 1, "status bar text"),
        });
        return { success: true };
      }
      case "remove_statusbar_item": {
        if (!manifest.permissions.includes("ui:statusbar"))
          throw new Error("Missing ui:statusbar permission");
        const remove_id = `${plugin_id}:${read_param_string(params, 0, "status bar item id")}`;
        this.context.services.plugin.unregister_status_bar_item(remove_id);
        return { success: true };
      }
      case "add_sidebar_panel": {
        if (!manifest.permissions.includes("ui:panel"))
          throw new Error("Missing ui:panel permission");
        const {
          id: panel_id,
          label,
          icon,
        } = read_sidebar_panel_input(params[0]);
        const namespaced_panel_id = `${plugin_id}:${panel_id}`;
        this.context.services.plugin.register_sidebar_view({
          id: namespaced_panel_id,
          label,
          icon: resolve_sidebar_icon(icon),
          panel: PluginSidebarPanel,
          panel_props: {
            plugin_id,
            label,
          },
        });
        return { success: true };
      }
      case "remove_sidebar_panel": {
        if (!manifest.permissions.includes("ui:panel"))
          throw new Error("Missing ui:panel permission");
        const remove_panel_id = `${plugin_id}:${read_param_string(params, 0, "sidebar panel id")}`;
        this.context.services.plugin.unregister_sidebar_view(remove_panel_id);
        return { success: true };
      }
      case "show_notice": {
        const { message, duration } = read_notice_input(params[0]);
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
        } = read_ribbon_icon_input(params[0]);
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
        const remove_ribbon_id = `${plugin_id}:${read_param_string(params, 0, "ribbon icon id")}`;
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
    params: RpcParams,
  ) {
    if (!this.settings_service) {
      throw new Error("Settings service not initialized");
    }

    switch (action) {
      case "get":
        return this.settings_service.get_setting(
          plugin_id,
          read_param_string(params, 0, "setting key"),
        );
      case "set":
        await this.settings_service.set_setting(
          plugin_id,
          read_param_string(params, 0, "setting key"),
          params[1],
        );
        return { success: true };
      case "get_all":
        return this.settings_service.get_all_settings(plugin_id);
      case "register_tab": {
        if (!manifest.permissions.includes("settings:register")) {
          throw new Error("Missing settings:register permission");
        }
        const { label, icon } = read_settings_tab_input(params[0]);
        const tab: PluginSettingsTab = {
          plugin_id,
          label: label ?? manifest.name,
        };
        if (icon !== undefined) {
          tab.icon = icon;
        }
        this.context.services.plugin.register_settings_tab(tab);
        return { success: true };
      }
      default:
        throw new Error(`Unknown settings action: ${action}`);
    }
  }

  private handle_events(
    plugin_id: string,
    manifest: PluginManifest,
    action: string,
    params: RpcParams,
  ) {
    if (!manifest.permissions.includes("events:subscribe")) {
      throw new Error("Missing events:subscribe permission");
    }

    if (!this.event_bus) {
      throw new Error("Event bus not initialized");
    }

    switch (action) {
      case "on": {
        const event_type = read_param_string(
          params,
          0,
          "event type",
        ) as PluginEventType;
        const callback_id = read_param_string(params, 1, "callback id");
        this.event_bus.subscribe(plugin_id, event_type, callback_id);
        return { success: true };
      }
      case "off": {
        const callback_id = read_param_string(params, 0, "callback id");
        this.event_bus.unsubscribe(plugin_id, callback_id);
        return { success: true };
      }
      default:
        throw new Error(`Unknown events action: ${action}`);
    }
  }
}
