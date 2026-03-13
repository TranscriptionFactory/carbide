import type { AppContext } from "$lib/app/di/create_app_context";
import type { PluginManifest } from "../ports";
import { as_markdown_text, as_note_path } from "$lib/shared/types/ids";
import PluginStatusBarItem from "../ui/plugin_status_bar_item.svelte";

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

/**
 * Handles RPC requests from plugin iframes.
 * Enforces permissions and routes to appropriate services.
 */
export class PluginRpcHandler {
  constructor(
    private readonly context: {
      services: AppContext["services"];
      stores: AppContext["stores"];
    },
  ) {}

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
      default:
        throw new Error(`Unknown namespace: ${namespace}`);
    }
  }

  private async handle_vault(
    manifest: PluginManifest,
    action: string,
    params: any[],
  ): Promise<any> {
    if (!manifest.permissions.includes("fs:read") && !manifest.permissions.includes("fs:write")) {
        throw new Error("Missing vault permissions (fs:read or fs:write)");
    }

    switch (action) {
      case "read":
        return (this.context.services.note as any).read_note(as_note_path(params[0]));
      case "create":
        if (!manifest.permissions.includes("fs:write")) throw new Error("Missing fs:write permission");
        return (this.context.services.note as any).create_note(as_note_path(params[0]), as_markdown_text(params[1] ?? ""));
      case "modify":
        if (!manifest.permissions.includes("fs:write")) throw new Error("Missing fs:write permission");
        return (this.context.services.note as any).write_note(as_note_path(params[0]), as_markdown_text(params[1]));
      case "delete":
        if (!manifest.permissions.includes("fs:write")) throw new Error("Missing fs:write permission");
        // Simplified delete
        const meta = this.context.stores.notes.notes.find(n => n.path === params[0]);
        if (!meta) throw new Error("Note not found");
        return this.context.services.note.delete_note(meta);
      case "list":
        return this.context.stores.notes.notes.map(n => n.path);
      default:
        throw new Error(`Unknown vault action: ${action}`);
    }
  }

  private async handle_editor(
    manifest: PluginManifest,
    action: string,
    params: any[],
  ): Promise<any> {
    if (!manifest.permissions.includes("editor:read") && !manifest.permissions.includes("editor:modify")) {
        throw new Error("Missing editor permissions (editor:read or editor:modify)");
    }

    const open_note = this.context.stores.editor.open_note;
    if (!open_note) throw new Error("No active editor");

    switch (action) {
      case "get_value":
        return open_note.markdown;
      case "set_value":
        if (!manifest.permissions.includes("editor:modify")) throw new Error("Missing editor:modify permission");
        this.context.services.editor.apply_ai_output("full_note", params[0], null);
        return { success: true };
      case "get_selection":
        const ctx = this.context.services.editor.get_ai_context();
        return ctx?.selection?.text ?? "";
      case "replace_selection":
        if (!manifest.permissions.includes("editor:modify")) throw new Error("Missing editor:modify permission");
        const snapshot = this.context.services.editor.get_ai_context()?.selection;
        this.context.services.editor.apply_ai_output("selection", params[0], snapshot ?? null);
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
        if (!manifest.permissions.includes("ui:statusbar")) throw new Error("Missing ui:statusbar permission");
        const { id, priority, initial_text } = params[0];
        const namespaced_id = `${plugin_id}:${id}`;
        this.context.services.plugin.register_status_bar_item({
          id: namespaced_id,
          priority,
          component: PluginStatusBarItem,
          props: { id: namespaced_id, text: initial_text }
        });
        return { success: true };
      case "update_statusbar_item":
        if (!manifest.permissions.includes("ui:statusbar")) throw new Error("Missing ui:statusbar permission");
        const target_id = `${plugin_id}:${params[0]}`;
        const item = this.context.stores.plugin.status_bar_items.find(i => i.id === target_id);
        if (item) {
          item.props = { ...item.props, text: params[1] };
        }
        return { success: true };
      default:
        throw new Error(`Unknown ui action: ${action}`);
    }
  }
}
