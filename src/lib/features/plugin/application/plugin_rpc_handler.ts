import type { CommandDefinition } from "$lib/features/search";
import type {
  PluginManifest,
  PluginEventType,
  PluginSettingSchema,
  PluginSettingsTab,
  SlashCommandContribution,
  PluginHttpFetchRequest,
  PluginHttpFetchResponse,
} from "../ports";
import { Blocks, LayoutDashboard } from "@lucide/svelte";
import { as_markdown_text, as_note_path } from "$lib/shared/types/ids";
import PluginStatusBarItem from "../ui/plugin_status_bar_item.svelte";
import PluginSidebarPanel from "../ui/plugin_sidebar_panel.svelte";
import { toast } from "svelte-sonner";
import type { PluginEventBus } from "./plugin_event_bus";
import type { PluginSettingsService } from "./plugin_settings_service";
import type { PluginService } from "./plugin_service";
import type { Diagnostic, DiagnosticSeverity } from "$lib/features/diagnostics";

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
  read_asset(asset_path: string): Promise<{ data: string; mime_type: string }>;
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
  settings_schema: PluginSettingSchema[];
};

type PluginRpcSearchBackend = {
  fts(
    query: string,
    limit?: number,
  ): Promise<{ path: string; score: number }[]>;
  tags(): Promise<{ tag: string; count: number }[]>;
  notes_for_tag(tag: string): Promise<string[]>;
};

type PluginRpcDiagnosticsBackend = {
  push(source_id: string, file_path: string, diagnostics: Diagnostic[]): void;
  clear(source_id: string, file_path?: string): void;
};

type PluginRpcMetadataBackend = {
  query(query: unknown): Promise<unknown>;
  list_properties(): Promise<unknown>;
  get_backlinks(note_path: string): Promise<{ path: string }[]>;
  get_stats(note_path: string): Promise<unknown>;
  get_file_cache(note_path: string): Promise<unknown>;
};

type McpToolDefinition = {
  name: string;
  description: string;
  inputSchema: unknown;
};

type McpToolResult = {
  content: Array<{ type: string; text: string }>;
  isError: boolean;
};

type PluginRegisteredTool = {
  plugin_id: string;
  definition: McpToolDefinition;
};

type PluginRpcMcpBackend = {
  list_tool_definitions(): Promise<McpToolDefinition[]>;
  call_tool(
    tool_name: string,
    tool_arguments?: Record<string, unknown>,
  ): Promise<McpToolResult>;
};

type PluginRpcNetworkBackend = {
  fetch(request: PluginHttpFetchRequest): Promise<PluginHttpFetchResponse>;
};

export type PluginRpcAiBackend = {
  execute(input: {
    prompt: string;
    mode?: "edit" | "ask";
  }): Promise<{ success: boolean; output: string; error: string | null }>;
};

type PluginRpcExportBackend = {
  save_binary(
    data: number[],
    default_filename: string,
    filters?: { name: string; extensions: string[] }[],
  ): Promise<{ success: boolean; path: string | null }>;
};

export type PluginRpcContext = {
  services: {
    note: PluginRpcNoteService;
    editor: PluginRpcEditorService;
    plugin: Pick<
      PluginService,
      | "register_command"
      | "unregister_command"
      | "register_slash_command"
      | "unregister_slash_command"
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
    editor: {
      open_note: {
        markdown: string;
        meta: { path: string; name: string };
      } | null;
    };
    tab: {
      active_tab: {
        kind: string;
        file_path?: string;
        file_type?: string;
      } | null;
    };
  };
  search?: PluginRpcSearchBackend;
  diagnostics?: PluginRpcDiagnosticsBackend;
  metadata?: PluginRpcMetadataBackend;
  network?: PluginRpcNetworkBackend;
  ai?: PluginRpcAiBackend;
  mcp?: PluginRpcMcpBackend;
  export?: PluginRpcExportBackend;
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
    description: read_optional_string(record.description) ?? "",
    keywords: Array.isArray(record.keywords)
      ? read_string_array(record.keywords, "command.keywords")
      : [],
    icon: (read_optional_string(record.icon) ??
      "puzzle") as CommandDefinition["icon"],
  };
}

function read_slash_command_input(input: unknown): SlashCommandContribution {
  const record = read_record(input, "slash command");
  const result: SlashCommandContribution = {
    id: read_string(record.id, "slash_command.id"),
    name: read_string(record.name, "slash_command.name"),
    description: read_string(record.description, "slash_command.description"),
  };
  const icon = read_optional_string(record.icon);
  if (icon !== undefined) result.icon = icon;
  if (Array.isArray(record.keywords)) {
    result.keywords = read_string_array(
      record.keywords,
      "slash_command.keywords",
    );
  }
  const permission = read_optional_string(record.permission);
  if (permission !== undefined) result.permission = permission;
  return result;
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
    return { settings_schema: [] };
  }

  const record = read_record(input, "settings tab");
  return {
    label: read_optional_string(record.label),
    icon: read_optional_string(record.icon),
    settings_schema: [
      ...read_settings_tab_settings(record),
      ...read_settings_tab_properties(record),
    ],
  };
}

function read_setting_type(
  value: unknown,
  label: string,
): PluginSettingSchema["type"] {
  if (
    value === "string" ||
    value === "number" ||
    value === "boolean" ||
    value === "select" ||
    value === "textarea"
  ) {
    return value;
  }

  throw new Error(`Invalid ${label}`);
}

function read_setting_options(
  value: unknown,
  label: string,
): { label: string; value: string }[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new Error(`Invalid ${label}`);
  }

  return value.map((option, index) => {
    const option_label = `${label}[${String(index)}]`;

    if (typeof option === "string") {
      return {
        label: option,
        value: option,
      };
    }

    const record = read_record(option, option_label);
    const option_value = read_string(record.value, `${option_label}.value`);

    return {
      label: read_optional_string(record.label) ?? option_value,
      value: option_value,
    };
  });
}

function read_setting_schema(
  key: string,
  input: unknown,
  label: string,
): PluginSettingSchema {
  const record = read_record(input, label);
  const schema: PluginSettingSchema = {
    key,
    type: read_setting_type(record.type, `${label}.type`),
    label: read_optional_string(record.label) ?? key,
  };

  const description = read_optional_string(record.description);
  if (description !== undefined) {
    schema.description = description;
  }

  if ("default" in record) {
    schema.default = record.default;
  }

  const options = read_setting_options(record.options, `${label}.options`);
  if (options !== undefined) {
    schema.options = options;
  }

  const placeholder = read_optional_string(record.placeholder);
  if (placeholder !== undefined) {
    schema.placeholder = placeholder;
  }

  const min = read_optional_number(record.min, `${label}.min`);
  if (min !== undefined) {
    schema.min = min;
  }

  const max = read_optional_number(record.max, `${label}.max`);
  if (max !== undefined) {
    schema.max = max;
  }

  return schema;
}

function read_settings_tab_settings(record: RpcRecord): PluginSettingSchema[] {
  const settings = record.settings;
  if (settings === undefined) {
    return [];
  }

  if (!Array.isArray(settings)) {
    throw new Error("Invalid settings tab settings");
  }

  return settings.map((entry, index) => {
    const schema_label = `settings tab settings[${String(index)}]`;
    const schema_record = read_record(entry, schema_label);
    return read_setting_schema(
      read_string(schema_record.key, `${schema_label}.key`),
      schema_record,
      schema_label,
    );
  });
}

function read_settings_tab_properties(
  record: RpcRecord,
): PluginSettingSchema[] {
  const properties = record.properties;
  if (properties === undefined) {
    return [];
  }

  const properties_record = read_record(properties, "settings tab properties");
  return Object.entries(properties_record).map(([key, value]) =>
    read_setting_schema(key, value, `settings tab properties.${key}`),
  );
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
  private registered_tools: Map<string, PluginRegisteredTool> = new Map();

  constructor(private readonly context: PluginRpcContext) {}

  get_registered_tools(): PluginRegisteredTool[] {
    return [...this.registered_tools.values()];
  }

  set_event_bus(event_bus: PluginEventBus) {
    this.event_bus = event_bus;
  }

  set_settings_service(settings_service: PluginSettingsService) {
    this.settings_service = settings_service;
  }

  private is_permission_granted(
    plugin_id: string,
    permission: string,
  ): boolean {
    return (
      this.settings_service?.is_permission_granted(plugin_id, permission) ??
      false
    );
  }

  private require_permission(plugin_id: string, permission: string) {
    if (!this.is_permission_granted(plugin_id, permission)) {
      throw new Error(`Missing ${permission} permission`);
    }
  }

  private require_any_permission(plugin_id: string, permissions: string[]) {
    if (
      permissions.some((permission) =>
        this.is_permission_granted(plugin_id, permission),
      )
    ) {
      return;
    }

    throw new Error(
      `Missing one of required permissions: ${permissions.join(", ")}`,
    );
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
        return this.handle_vault(plugin_id, action, params);
      case "editor":
        return this.handle_editor(plugin_id, action, params);
      case "commands":
        return this.handle_commands(plugin_id, action, params);
      case "ui":
        return this.handle_ui(plugin_id, action, params);
      case "settings":
        return this.handle_settings(plugin_id, manifest, action, params);
      case "events":
        return this.handle_events(plugin_id, action, params);
      case "search":
        return this.handle_search(plugin_id, action, params);
      case "diagnostics":
        return this.handle_diagnostics(plugin_id, action, params);
      case "metadata":
        return this.handle_metadata(plugin_id, action, params);
      case "network":
        return this.handle_network(plugin_id, manifest, action, params);
      case "ai":
        return this.handle_ai(plugin_id, action, params);
      case "mcp":
        return this.handle_mcp(plugin_id, action, params);
      case "export":
        return this.handle_export(plugin_id, action, params);
      default:
        throw new Error(`Unknown namespace: ${namespace}`);
    }
  }

  private handle_vault(plugin_id: string, action: string, params: RpcParams) {
    this.require_any_permission(plugin_id, ["fs:read", "fs:write"]);

    switch (action) {
      case "read":
        return this.context.services.note.read_note(
          as_note_path(read_param_string(params, 0, "note path")),
        );
      case "create":
        this.require_permission(plugin_id, "fs:write");
        return this.context.services.note.create_note(
          as_note_path(read_param_string(params, 0, "note path")),
          as_markdown_text(read_string(params[1] ?? "", "markdown")),
        );
      case "modify":
        this.require_permission(plugin_id, "fs:write");
        return this.context.services.note.write_note(
          as_note_path(read_param_string(params, 0, "note path")),
          as_markdown_text(read_param_string(params, 1, "markdown")),
        );
      case "delete":
        this.require_permission(plugin_id, "fs:write");
        return this.context.services.note.delete_note(
          read_param_string(params, 0, "note path"),
        );
      case "list":
        return this.context.stores.notes.notes.map((n) => n.path);
      case "read_asset":
        return this.context.services.note.read_asset(
          read_param_string(params, 0, "asset path"),
        );
      default:
        throw new Error(`Unknown vault action: ${action}`);
    }
  }

  private handle_editor(plugin_id: string, action: string, params: RpcParams) {
    this.require_any_permission(plugin_id, ["editor:read", "editor:modify"]);

    const open_note = this.context.stores.editor.open_note;

    if (action === "get_info") {
      if (open_note) {
        return { path: open_note.meta.path, name: open_note.meta.name };
      }
      const active_tab = this.context.stores.tab.active_tab;
      if (active_tab?.kind === "document" && active_tab.file_path) {
        const fp = active_tab.file_path;
        const last_slash = fp.lastIndexOf("/");
        const name = last_slash >= 0 ? fp.slice(last_slash + 1) : fp;
        return { path: fp, name };
      }
      throw new Error("No active editor");
    }

    if (!open_note) throw new Error("No active editor");

    switch (action) {
      case "get_value":
        return open_note.markdown;
      case "set_value": {
        this.require_permission(plugin_id, "editor:modify");
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
        this.require_permission(plugin_id, "editor:modify");
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
    action: string,
    params: RpcParams,
  ) {
    this.require_permission(plugin_id, "commands:register");

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
      case "register_slash": {
        const slash_cmd = read_slash_command_input(params[0]);
        const namespaced: SlashCommandContribution & { plugin_id: string } = {
          ...slash_cmd,
          id: `${plugin_id}:${slash_cmd.id}`,
          plugin_id,
        };
        this.context.services.plugin.register_slash_command(namespaced);
        return { success: true };
      }
      case "remove_slash": {
        const remove_id = `${plugin_id}:${read_param_string(params, 0, "slash command id")}`;
        this.context.services.plugin.unregister_slash_command(remove_id);
        return { success: true };
      }
      default:
        throw new Error(`Unknown commands action: ${action}`);
    }
  }

  private handle_ui(plugin_id: string, action: string, params: RpcParams) {
    switch (action) {
      case "add_statusbar_item": {
        this.require_permission(plugin_id, "ui:statusbar");
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
        this.require_permission(plugin_id, "ui:statusbar");
        const target_id = `${plugin_id}:${read_param_string(params, 0, "status bar item id")}`;
        this.context.services.plugin.update_status_bar_item(target_id, {
          text: read_param_string(params, 1, "status bar text"),
        });
        return { success: true };
      }
      case "remove_statusbar_item": {
        this.require_permission(plugin_id, "ui:statusbar");
        const remove_id = `${plugin_id}:${read_param_string(params, 0, "status bar item id")}`;
        this.context.services.plugin.unregister_status_bar_item(remove_id);
        return { success: true };
      }
      case "add_sidebar_panel": {
        this.require_permission(plugin_id, "ui:panel");
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
        this.require_permission(plugin_id, "ui:panel");
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
        this.require_permission(plugin_id, "ui:ribbon");
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
        this.require_permission(plugin_id, "ui:ribbon");
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
        this.require_permission(plugin_id, "settings:register");
        const { label, icon, settings_schema } = read_settings_tab_input(
          params[0],
        );
        const tab: PluginSettingsTab = {
          plugin_id,
          label: label ?? manifest.name,
          settings_schema,
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

  private handle_events(plugin_id: string, action: string, params: RpcParams) {
    this.require_permission(plugin_id, "events:subscribe");

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

  private async handle_search(
    plugin_id: string,
    action: string,
    params: RpcParams,
  ) {
    this.require_permission(plugin_id, "search:read");

    if (!this.context.search) {
      throw new Error("Search backend not initialized");
    }

    switch (action) {
      case "fts": {
        const query = read_param_string(params, 0, "search query");
        const limit = read_optional_number(params[1], "search limit");
        return this.context.search.fts(query, limit);
      }
      case "tags": {
        if (params[0] !== undefined) {
          const tag = read_param_string(params, 0, "tag pattern");
          return this.context.search.notes_for_tag(tag);
        }
        return this.context.search.tags();
      }
      default:
        throw new Error(`Unknown search action: ${action}`);
    }
  }

  private async handle_metadata(
    plugin_id: string,
    action: string,
    params: RpcParams,
  ): Promise<unknown> {
    this.require_permission(plugin_id, "metadata:read");

    if (!this.context.metadata) {
      throw new Error("Metadata backend not initialized");
    }

    switch (action) {
      case "query": {
        const query = params[0];
        if (!query || typeof query !== "object") {
          throw new Error("Invalid query object");
        }
        return this.context.metadata.query(query);
      }
      case "list_properties":
        return this.context.metadata.list_properties();
      case "get_backlinks": {
        const note_path = read_param_string(params, 0, "note path");
        return this.context.metadata.get_backlinks(note_path);
      }
      case "get_stats": {
        const note_path = read_param_string(params, 0, "note path");
        return this.context.metadata.get_stats(note_path);
      }
      case "get_file_cache": {
        const note_path = read_param_string(params, 0, "note path");
        return this.context.metadata.get_file_cache(note_path);
      }
      default:
        throw new Error(`Unknown metadata action: ${action}`);
    }
  }

  private handle_diagnostics(
    plugin_id: string,
    action: string,
    params: RpcParams,
  ) {
    this.require_permission(plugin_id, "diagnostics:write");

    if (!this.context.diagnostics) {
      throw new Error("Diagnostics backend not initialized");
    }

    const source_id = `plugin:${plugin_id}`;

    switch (action) {
      case "push": {
        const file_path = read_param_string(params, 0, "file path");
        const raw_diagnostics = params[1];
        if (!Array.isArray(raw_diagnostics)) {
          throw new Error("Invalid diagnostics array");
        }
        const diagnostics = raw_diagnostics.map((d, i) =>
          read_plugin_diagnostic(d, source_id, i),
        );
        this.context.diagnostics.push(source_id, file_path, diagnostics);
        return { success: true };
      }
      case "clear": {
        const file_path = read_optional_string(params[0]);
        this.context.diagnostics.clear(source_id, file_path);
        return { success: true };
      }
      default:
        throw new Error(`Unknown diagnostics action: ${action}`);
    }
  }

  private async handle_ai(
    plugin_id: string,
    action: string,
    params: RpcParams,
  ) {
    this.require_permission(plugin_id, "ai:execute");

    if (!this.context.ai) {
      throw new Error("AI backend not initialized");
    }

    switch (action) {
      case "execute": {
        const opts = read_record(params[0], "ai.execute options");
        const prompt = read_string(opts.prompt, "prompt");
        const mode = read_optional_string(opts.mode);
        if (mode !== undefined && mode !== "edit" && mode !== "ask") {
          throw new Error('Invalid mode: must be "edit" or "ask"');
        }
        return this.context.ai.execute({ prompt, mode: mode ?? "ask" });
      }
      default:
        throw new Error(`Unknown ai action: ${action}`);
    }
  }

  private async handle_mcp(
    plugin_id: string,
    action: string,
    params: RpcParams,
  ): Promise<unknown> {
    this.require_permission(plugin_id, "mcp:access");

    if (!this.context.mcp) {
      throw new Error("MCP backend not initialized");
    }

    switch (action) {
      case "list_tools": {
        const native_tools = await this.context.mcp.list_tool_definitions();
        const plugin_tools = this.get_registered_tools().map(
          (t) => t.definition,
        );
        return [...native_tools, ...plugin_tools];
      }
      case "call_tool": {
        const tool_name = read_param_string(params, 0, "tool name");
        const args =
          params[1] !== undefined
            ? (read_record(params[1], "tool arguments") as Record<
                string,
                unknown
              >)
            : undefined;
        return this.context.mcp.call_tool(tool_name, args);
      }
      case "register_tool": {
        this.require_permission(plugin_id, "mcp:register");
        const raw_def = read_record(params[0], "tool definition");
        const name = read_string(raw_def.name, "tool name");
        const description = read_string(
          raw_def.description,
          "tool description",
        );
        const namespaced_name = `${plugin_id}:${name}`;
        const definition: McpToolDefinition = {
          name: namespaced_name,
          description,
          inputSchema: raw_def.inputSchema ??
            raw_def.input_schema ?? {
              type: "object",
              properties: {},
              required: [],
            },
        };
        this.registered_tools.set(namespaced_name, {
          plugin_id,
          definition,
        });
        return { success: true, name: namespaced_name };
      }
      default:
        throw new Error(`Unknown mcp action: ${action}`);
    }
  }

  private async handle_network(
    plugin_id: string,
    manifest: PluginManifest,
    action: string,
    params: RpcParams,
  ) {
    this.require_permission(plugin_id, "network:fetch");

    if (!this.context.network) {
      throw new Error("Network backend not initialized");
    }

    switch (action) {
      case "fetch": {
        const url = read_param_string(params, 0, "url");
        const opts = params[1] ? read_record(params[1], "options") : {};

        const origin = extract_origin(url);
        if (origin && manifest.allowed_origins?.length) {
          if (!manifest.allowed_origins.includes(origin)) {
            throw new Error(
              `Origin "${origin}" is not in this plugin's allowed_origins`,
            );
          }
        }

        const method =
          read_optional_string(opts.method)?.toUpperCase() ?? "GET";
        const headers = opts.headers
          ? read_string_record(opts.headers, "headers")
          : undefined;
        const body = read_optional_string(opts.body);

        return this.context.network.fetch({
          url,
          method,
          headers,
          body,
        });
      }
      default:
        throw new Error(`Unknown network action: ${action}`);
    }
  }
  private async handle_export(
    plugin_id: string,
    action: string,
    params: RpcParams,
  ) {
    this.require_permission(plugin_id, "export:save");

    if (!this.context.export) {
      throw new Error("Export backend not initialized");
    }

    switch (action) {
      case "save_binary": {
        const data = params[0];
        if (!Array.isArray(data)) {
          throw new Error("Invalid data: expected number array");
        }
        const default_filename = read_param_string(
          params,
          1,
          "default filename",
        );
        const filters = params[2] as
          | { name: string; extensions: string[] }[]
          | undefined;
        return this.context.export.save_binary(
          data as number[],
          default_filename,
          filters,
        );
      }
      default:
        throw new Error(`Unknown export action: ${action}`);
    }
  }
}

function extract_origin(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.origin;
  } catch {
    return null;
  }
}

function read_string_record(
  value: unknown,
  label: string,
): Record<string, string> {
  const record = read_record(value, label);
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(record)) {
    if (typeof v !== "string") {
      throw new Error(`Invalid ${label}.${k}: expected string`);
    }
    result[k] = v;
  }
  return result;
}

const VALID_SEVERITIES = new Set<DiagnosticSeverity>([
  "error",
  "warning",
  "info",
  "hint",
]);

function read_plugin_diagnostic(
  input: unknown,
  source_id: string,
  index: number,
): Diagnostic {
  const label = `diagnostics[${String(index)}]`;
  const record = read_record(input, label);
  const severity = read_string(
    record.severity,
    `${label}.severity`,
  ) as DiagnosticSeverity;
  if (!VALID_SEVERITIES.has(severity)) {
    throw new Error(`Invalid ${label}.severity: ${severity}`);
  }
  return {
    source: source_id as Diagnostic["source"],
    line: read_number(record.line, `${label}.line`),
    column: read_number(record.column, `${label}.column`),
    end_line: read_number(record.end_line, `${label}.end_line`),
    end_column: read_number(record.end_column, `${label}.end_column`),
    severity,
    message: read_string(record.message, `${label}.message`),
    rule_id: read_optional_string(record.rule_id) ?? null,
    fixable: record.fixable === true,
  };
}
