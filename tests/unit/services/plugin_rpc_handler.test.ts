import { describe, expect, it, vi, beforeEach } from "vitest";
import { PluginRpcHandler } from "$lib/features/plugin/application/plugin_rpc_handler";
import type { PluginRpcContext } from "$lib/features/plugin/application/plugin_rpc_handler";
import type { PluginSettingsService } from "$lib/features/plugin/application/plugin_settings_service";
import type { PluginManifest, SidebarView } from "$lib/features/plugin/ports";
import { PluginEventBus } from "$lib/features/plugin/application/plugin_event_bus";

vi.mock("svelte-sonner", () => ({ toast: { info: vi.fn() } }));
import { toast } from "svelte-sonner";

function make_manifest(permissions: string[]): PluginManifest {
  return {
    id: "test-plugin",
    name: "Test Plugin",
    version: "0.1.0",
    permissions,
    entry: "index.js",
  } as unknown as PluginManifest;
}

function make_context() {
  const read_note = vi.fn();
  const create_note = vi.fn();
  const write_note = vi.fn();
  const delete_note = vi.fn();
  const apply_ai_output = vi.fn();
  const get_ai_context = vi.fn();
  const plugin = {
    register_command: vi.fn(),
    unregister_command: vi.fn(),
    register_slash_command: vi.fn(),
    unregister_slash_command: vi.fn(),
    register_status_bar_item: vi.fn(),
    update_status_bar_item: vi.fn(),
    unregister_status_bar_item: vi.fn(),
    register_sidebar_view: vi.fn(),
    unregister_sidebar_view: vi.fn(),
    register_ribbon_icon: vi.fn(),
    unregister_ribbon_icon: vi.fn(),
    register_settings_tab: vi.fn(),
  };

  const context: PluginRpcContext = {
    services: {
      note: {
        read_note,
        create_note,
        write_note,
        delete_note,
      },
      editor: {
        apply_ai_output,
        get_ai_context,
      },
      plugin,
    },
    stores: {
      notes: { notes: [] },
      editor: { open_note: null },
    },
  };

  return {
    context,
    plugin,
    read_note,
    create_note,
    write_note,
    delete_note,
    apply_ai_output,
    get_ai_context,
  };
}

function make_settings_service(granted_permissions: string[] = []) {
  return {
    get_setting: vi.fn().mockResolvedValue("stored-value"),
    set_setting: vi.fn().mockResolvedValue(undefined),
    get_all_settings: vi.fn().mockResolvedValue({ theme: "dark", count: 1 }),
    is_permission_granted: vi.fn((_plugin_id: string, permission: string) =>
      granted_permissions.includes(permission),
    ),
  };
}

const PLUGIN_ID = "test-plugin";

describe("PluginRpcHandler", () => {
  let ctx: ReturnType<typeof make_context>;
  let handler: PluginRpcHandler;

  beforeEach(() => {
    ctx = make_context();
    handler = new PluginRpcHandler(ctx.context);
  });

  function grant_permissions(...permissions: string[]) {
    const svc = make_settings_service(permissions);
    handler.set_settings_service(svc as unknown as PluginSettingsService);
    return svc;
  }

  describe("vault.*", () => {
    it("reads notes when fs:read is granted", async () => {
      const svc = grant_permissions("fs:read");
      ctx.read_note.mockResolvedValueOnce({
        markdown: "# Test",
      });

      const manifest = make_manifest(["fs:read"]);
      const response = await handler.handle_request(PLUGIN_ID, manifest, {
        id: "v1",
        method: "vault.read",
        params: ["notes/test.md"],
      });

      expect(response.error).toBeUndefined();
      expect(svc.is_permission_granted).toHaveBeenCalledWith(
        PLUGIN_ID,
        "fs:read",
      );
      expect(ctx.read_note).toHaveBeenCalled();
    });

    it("blocks vault access when fs permission is requested but not granted", async () => {
      grant_permissions();

      const manifest = make_manifest(["fs:read"]);
      const response = await handler.handle_request(PLUGIN_ID, manifest, {
        id: "v2",
        method: "vault.list",
        params: [],
      });

      expect(response.error).toMatch(
        /Missing one of required permissions: fs:read, fs:write/,
      );
    });

    it("blocks vault writes when only fs:read is granted", async () => {
      grant_permissions("fs:read");

      const manifest = make_manifest(["fs:read", "fs:write"]);
      const response = await handler.handle_request(PLUGIN_ID, manifest, {
        id: "v3",
        method: "vault.create",
        params: ["notes/test.md", "# Test"],
      });

      expect(response.error).toMatch(/Missing fs:write permission/);
    });
  });

  describe("editor.*", () => {
    it("returns editor content when editor:read is granted", async () => {
      grant_permissions("editor:read");
      ctx.context.stores.editor.open_note = { markdown: "# Active" };

      const manifest = make_manifest(["editor:read"]);
      const response = await handler.handle_request(PLUGIN_ID, manifest, {
        id: "ed1",
        method: "editor.get_value",
        params: [],
      });

      expect(response.error).toBeUndefined();
      expect(response.result).toBe("# Active");
    });

    it("blocks editor writes when editor:modify is not granted", async () => {
      grant_permissions("editor:read");
      ctx.context.stores.editor.open_note = { markdown: "# Active" };

      const manifest = make_manifest(["editor:read", "editor:modify"]);
      const response = await handler.handle_request(PLUGIN_ID, manifest, {
        id: "ed2",
        method: "editor.set_value",
        params: ["# Updated"],
      });

      expect(response.error).toMatch(/Missing editor:modify permission/);
    });
  });

  describe("commands.remove", () => {
    it("removes a previously registered command", async () => {
      grant_permissions("commands:register");
      const manifest = make_manifest(["commands:register"]);
      const response = await handler.handle_request(PLUGIN_ID, manifest, {
        id: "1",
        method: "commands.remove",
        params: ["my-command"],
      });

      expect(response.error).toBeUndefined();
      expect(response.result).toEqual({ success: true });
      expect(ctx.plugin.unregister_command).toHaveBeenCalledWith(
        `${PLUGIN_ID}:my-command`,
      );
    });

    it("throws when commands:register is requested but not granted", async () => {
      grant_permissions();
      const manifest = make_manifest(["commands:register"]);
      const response = await handler.handle_request(PLUGIN_ID, manifest, {
        id: "1",
        method: "commands.remove",
        params: ["my-command"],
      });

      expect(response.error).toMatch(/Missing commands:register permission/);
      expect(ctx.plugin.unregister_command).not.toHaveBeenCalled();
    });
  });

  describe("ui.add_sidebar_panel", () => {
    it("registers a sidebar view with namespaced id", async () => {
      grant_permissions("ui:panel");
      const manifest = make_manifest(["ui:panel"]);
      const response = await handler.handle_request(PLUGIN_ID, manifest, {
        id: "2",
        method: "ui.add_sidebar_panel",
        params: [{ id: "my-panel", label: "My Panel", icon: {} }],
      });

      expect(response.error).toBeUndefined();
      expect(response.result).toEqual({ success: true });
      expect(ctx.plugin.register_sidebar_view).toHaveBeenCalledOnce();
      const call = ctx.plugin.register_sidebar_view.mock.calls[0]?.[0] as
        | SidebarView
        | undefined;
      expect(call?.id).toBe(`${PLUGIN_ID}:my-panel`);
      expect(call?.label).toBe("My Panel");
    });

    it("throws when ui:panel is requested but not granted", async () => {
      grant_permissions();
      const manifest = make_manifest(["ui:panel"]);
      const response = await handler.handle_request(PLUGIN_ID, manifest, {
        id: "2",
        method: "ui.add_sidebar_panel",
        params: [{ id: "my-panel", label: "My Panel", icon: {} }],
      });

      expect(response.error).toMatch(/Missing ui:panel permission/);
      expect(ctx.plugin.register_sidebar_view).not.toHaveBeenCalled();
    });
  });

  describe("ui.remove_statusbar_item", () => {
    it("unregisters a status bar item", async () => {
      grant_permissions("ui:statusbar");
      const manifest = make_manifest(["ui:statusbar"]);
      const response = await handler.handle_request(PLUGIN_ID, manifest, {
        id: "3",
        method: "ui.remove_statusbar_item",
        params: ["my-item"],
      });

      expect(response.error).toBeUndefined();
      expect(response.result).toEqual({ success: true });
      expect(ctx.plugin.unregister_status_bar_item).toHaveBeenCalledWith(
        `${PLUGIN_ID}:my-item`,
      );
    });

    it("throws when ui:statusbar is requested but not granted", async () => {
      grant_permissions();
      const manifest = make_manifest(["ui:statusbar"]);
      const response = await handler.handle_request(PLUGIN_ID, manifest, {
        id: "3",
        method: "ui.remove_statusbar_item",
        params: ["my-item"],
      });

      expect(response.error).toMatch(/Missing ui:statusbar permission/);
      expect(ctx.plugin.unregister_status_bar_item).not.toHaveBeenCalled();
    });
  });

  describe("ui.remove_sidebar_panel", () => {
    it("unregisters a sidebar view", async () => {
      grant_permissions("ui:panel");
      const manifest = make_manifest(["ui:panel"]);
      const response = await handler.handle_request(PLUGIN_ID, manifest, {
        id: "4",
        method: "ui.remove_sidebar_panel",
        params: ["my-panel"],
      });

      expect(response.error).toBeUndefined();
      expect(response.result).toEqual({ success: true });
      expect(ctx.plugin.unregister_sidebar_view).toHaveBeenCalledWith(
        `${PLUGIN_ID}:my-panel`,
      );
    });

    it("throws when ui:panel is requested but not granted", async () => {
      grant_permissions();
      const manifest = make_manifest(["ui:panel"]);
      const response = await handler.handle_request(PLUGIN_ID, manifest, {
        id: "4",
        method: "ui.remove_sidebar_panel",
        params: ["my-panel"],
      });

      expect(response.error).toMatch(/Missing ui:panel permission/);
      expect(ctx.plugin.unregister_sidebar_view).not.toHaveBeenCalled();
    });
  });

  describe("ui.show_notice", () => {
    it("dispatches a toast with the given message", async () => {
      const manifest = make_manifest([]);
      const response = await handler.handle_request(PLUGIN_ID, manifest, {
        id: "5",
        method: "ui.show_notice",
        params: [{ message: "Hello from plugin", duration: 3000 }],
      });

      expect(response.error).toBeUndefined();
      expect(response.result).toEqual({ success: true });
      expect(vi.mocked(toast.info)).toHaveBeenCalledWith("Hello from plugin", {
        duration: 3000,
      });
    });

    it("uses default duration when not provided", async () => {
      const manifest = make_manifest([]);
      await handler.handle_request(PLUGIN_ID, manifest, {
        id: "5",
        method: "ui.show_notice",
        params: [{ message: "Notice" }],
      });

      expect(vi.mocked(toast.info)).toHaveBeenCalledWith("Notice", {
        duration: 4000,
      });
    });

    it("returns error when message is missing", async () => {
      const manifest = make_manifest([]);
      const response = await handler.handle_request(PLUGIN_ID, manifest, {
        id: "5",
        method: "ui.show_notice",
        params: [{}],
      });

      expect(response.error).toMatch(/Missing message parameter/);
    });
  });

  describe("settings.*", () => {
    it("settings.get returns a setting value without permission check", async () => {
      const svc = grant_permissions();

      const manifest = make_manifest([]);
      const response = await handler.handle_request(PLUGIN_ID, manifest, {
        id: "s1",
        method: "settings.get",
        params: ["theme"],
      });

      expect(response.error).toBeUndefined();
      expect(response.result).toBe("stored-value");
      expect(svc.get_setting).toHaveBeenCalledWith(PLUGIN_ID, "theme");
    });

    it("settings.set writes a setting and returns success", async () => {
      const svc = grant_permissions();

      const manifest = make_manifest([]);
      const response = await handler.handle_request(PLUGIN_ID, manifest, {
        id: "s2",
        method: "settings.set",
        params: ["theme", "light"],
      });

      expect(response.error).toBeUndefined();
      expect(response.result).toEqual({ success: true });
      expect(svc.set_setting).toHaveBeenCalledWith(PLUGIN_ID, "theme", "light");
    });

    it("settings.get_all returns all settings for the plugin", async () => {
      const svc = grant_permissions();

      const manifest = make_manifest([]);
      const response = await handler.handle_request(PLUGIN_ID, manifest, {
        id: "s3",
        method: "settings.get_all",
        params: [],
      });

      expect(response.error).toBeUndefined();
      expect(response.result).toEqual({ theme: "dark", count: 1 });
      expect(svc.get_all_settings).toHaveBeenCalledWith(PLUGIN_ID);
    });

    it("settings.* errors when settings service not initialized", async () => {
      const manifest = make_manifest([]);
      const response = await handler.handle_request(PLUGIN_ID, manifest, {
        id: "s4",
        method: "settings.get",
        params: ["key"],
      });

      expect(response.error).toMatch(/Settings service not initialized/);
    });

    it("settings.register_tab registers a settings tab with given label", async () => {
      grant_permissions("settings:register");

      const manifest = make_manifest(["settings:register"]);
      const response = await handler.handle_request(PLUGIN_ID, manifest, {
        id: "s5",
        method: "settings.register_tab",
        params: [{ label: "My Settings" }],
      });

      expect(response.error).toBeUndefined();
      expect(response.result).toEqual({ success: true });
      expect(ctx.plugin.register_settings_tab).toHaveBeenCalledWith({
        plugin_id: PLUGIN_ID,
        label: "My Settings",
        icon: undefined,
        settings_schema: [],
      });
    });

    it("settings.register_tab falls back to manifest name when label not provided", async () => {
      grant_permissions("settings:register");

      const manifest = make_manifest(["settings:register"]);
      const response = await handler.handle_request(PLUGIN_ID, manifest, {
        id: "s6",
        method: "settings.register_tab",
        params: [{}],
      });

      expect(response.error).toBeUndefined();
      expect(ctx.plugin.register_settings_tab).toHaveBeenCalledWith({
        plugin_id: PLUGIN_ID,
        label: manifest.name,
        icon: undefined,
        settings_schema: [],
      });
    });

    it("settings.register_tab keeps runtime schema from declarative properties", async () => {
      grant_permissions("settings:register");

      const manifest = make_manifest(["settings:register"]);
      const response = await handler.handle_request(PLUGIN_ID, manifest, {
        id: "s6b",
        method: "settings.register_tab",
        params: [
          {
            label: "Dynamic Settings",
            properties: {
              folder: {
                type: "string",
                label: "Folder",
                default: "daily/",
              },
              show_reading_time: {
                type: "boolean",
                label: "Show reading time",
                default: true,
              },
            },
          },
        ],
      });

      expect(response.error).toBeUndefined();
      expect(ctx.plugin.register_settings_tab).toHaveBeenCalledWith({
        plugin_id: PLUGIN_ID,
        label: "Dynamic Settings",
        icon: undefined,
        settings_schema: [
          {
            key: "folder",
            type: "string",
            label: "Folder",
            default: "daily/",
          },
          {
            key: "show_reading_time",
            type: "boolean",
            label: "Show reading time",
            default: true,
          },
        ],
      });
    });

    it("settings.register_tab throws when settings:register is requested but not granted", async () => {
      grant_permissions();
      const manifest = make_manifest(["settings:register"]);
      const response = await handler.handle_request(PLUGIN_ID, manifest, {
        id: "s7",
        method: "settings.register_tab",
        params: [{ label: "My Settings" }],
      });

      expect(response.error).toMatch(/Missing settings:register permission/);
      expect(ctx.plugin.register_settings_tab).not.toHaveBeenCalled();
    });
  });

  describe("events.*", () => {
    let event_bus: PluginEventBus;

    beforeEach(() => {
      event_bus = new PluginEventBus();
      handler.set_event_bus(event_bus);
    });

    it("events.on subscribes to an event type", async () => {
      grant_permissions("events:subscribe");
      const manifest = make_manifest(["events:subscribe"]);
      const response = await handler.handle_request(PLUGIN_ID, manifest, {
        id: "e1",
        method: "events.on",
        params: ["file-created", "cb-1"],
      });

      expect(response.error).toBeUndefined();
      expect(response.result).toEqual({ success: true });
      expect(event_bus.get_subscription_count(PLUGIN_ID)).toBe(1);
    });

    it("events.off unsubscribes a callback", async () => {
      grant_permissions("events:subscribe");
      const manifest = make_manifest(["events:subscribe"]);
      event_bus.subscribe(PLUGIN_ID, "file-created", "cb-1");

      const response = await handler.handle_request(PLUGIN_ID, manifest, {
        id: "e2",
        method: "events.off",
        params: ["cb-1"],
      });

      expect(response.error).toBeUndefined();
      expect(response.result).toEqual({ success: true });
      expect(event_bus.get_subscription_count(PLUGIN_ID)).toBe(0);
    });

    it("events.* throws when events:subscribe is requested but not granted", async () => {
      grant_permissions();
      const manifest = make_manifest(["events:subscribe"]);
      const response = await handler.handle_request(PLUGIN_ID, manifest, {
        id: "e3",
        method: "events.on",
        params: ["file-created", "cb-1"],
      });

      expect(response.error).toMatch(/Missing events:subscribe permission/);
    });

    it("events.* errors when event bus not initialized", async () => {
      const fresh_handler = new PluginRpcHandler(ctx.context);
      const svc = make_settings_service(["events:subscribe"]);
      fresh_handler.set_settings_service(
        svc as unknown as PluginSettingsService,
      );
      const manifest = make_manifest(["events:subscribe"]);
      const response = await fresh_handler.handle_request(PLUGIN_ID, manifest, {
        id: "e4",
        method: "events.on",
        params: ["file-created", "cb-1"],
      });

      expect(response.error).toMatch(/Event bus not initialized/);
    });
  });

  describe("search.*", () => {
    function make_search_backend() {
      return {
        fts: vi.fn().mockResolvedValue([{ path: "notes/test.md", score: 1.5 }]),
        tags: vi.fn().mockResolvedValue([{ tag: "project", count: 3 }]),
        notes_for_tag: vi.fn().mockResolvedValue(["notes/a.md", "notes/b.md"]),
      };
    }

    it("search.fts returns FTS results when search:read is granted", async () => {
      grant_permissions("search:read");
      const search = make_search_backend();
      ctx.context.search = search;

      const manifest = make_manifest(["search:read"]);
      const response = await handler.handle_request(PLUGIN_ID, manifest, {
        id: "s1",
        method: "search.fts",
        params: ["deadline"],
      });

      expect(response.error).toBeUndefined();
      expect(response.result).toEqual([{ path: "notes/test.md", score: 1.5 }]);
      expect(search.fts).toHaveBeenCalledWith("deadline", undefined);
    });

    it("search.fts passes limit parameter", async () => {
      grant_permissions("search:read");
      const search = make_search_backend();
      ctx.context.search = search;

      const manifest = make_manifest(["search:read"]);
      await handler.handle_request(PLUGIN_ID, manifest, {
        id: "s2",
        method: "search.fts",
        params: ["query", 10],
      });

      expect(search.fts).toHaveBeenCalledWith("query", 10);
    });

    it("search.tags returns all tags when no argument given", async () => {
      grant_permissions("search:read");
      const search = make_search_backend();
      ctx.context.search = search;

      const manifest = make_manifest(["search:read"]);
      const response = await handler.handle_request(PLUGIN_ID, manifest, {
        id: "s3",
        method: "search.tags",
        params: [],
      });

      expect(response.error).toBeUndefined();
      expect(response.result).toEqual([{ tag: "project", count: 3 }]);
      expect(search.tags).toHaveBeenCalled();
    });

    it("search.tags returns notes for a specific tag", async () => {
      grant_permissions("search:read");
      const search = make_search_backend();
      ctx.context.search = search;

      const manifest = make_manifest(["search:read"]);
      const response = await handler.handle_request(PLUGIN_ID, manifest, {
        id: "s4",
        method: "search.tags",
        params: ["project"],
      });

      expect(response.error).toBeUndefined();
      expect(response.result).toEqual(["notes/a.md", "notes/b.md"]);
      expect(search.notes_for_tag).toHaveBeenCalledWith("project");
    });

    it("search.* blocks when search:read is not granted", async () => {
      grant_permissions();
      ctx.context.search = make_search_backend();

      const manifest = make_manifest(["search:read"]);
      const response = await handler.handle_request(PLUGIN_ID, manifest, {
        id: "s5",
        method: "search.fts",
        params: ["query"],
      });

      expect(response.error).toMatch(/Missing search:read permission/);
    });

    it("search.* errors when search backend not initialized", async () => {
      grant_permissions("search:read");

      const manifest = make_manifest(["search:read"]);
      const response = await handler.handle_request(PLUGIN_ID, manifest, {
        id: "s6",
        method: "search.fts",
        params: ["query"],
      });

      expect(response.error).toMatch(/Search backend not initialized/);
    });
  });

  describe("metadata.*", () => {
    function make_metadata_backend() {
      return {
        query: vi.fn().mockResolvedValue({ rows: [], total: 0 }),
        list_properties: vi.fn().mockResolvedValue([
          {
            name: "status",
            property_type: "string",
            count: 5,
            unique_values: null,
          },
        ]),
        get_backlinks: vi
          .fn()
          .mockResolvedValue([{ path: "notes/linking.md" }]),
        get_stats: vi.fn().mockResolvedValue({
          word_count: 120,
          char_count: 800,
          heading_count: 3,
          outlink_count: 2,
          reading_time_secs: 48,
          last_indexed_at: 1700000000,
        }),
        get_file_cache: vi.fn().mockResolvedValue({
          frontmatter: { title: ["Cache Test", "string"] },
          tags: ["rust"],
          headings: [{ level: 1, text: "Heading", line: 5 }],
          links: [
            {
              target_path: "note-a",
              link_text: "note-a",
              link_type: "wikilink",
              section_heading: null,
              target_anchor: null,
            },
          ],
          embeds: [],
          stats: {
            word_count: 120,
            char_count: 800,
            heading_count: 1,
            outlink_count: 1,
            reading_time_secs: 48,
            task_count: 0,
            tasks_done: 0,
            tasks_todo: 0,
            next_due_date: null,
            last_indexed_at: 1700000000,
          },
          ctime_ms: 50,
          mtime_ms: 100,
          size_bytes: 256,
        }),
      };
    }

    it("metadata.query returns results when metadata:read is granted", async () => {
      grant_permissions("metadata:read");
      const metadata = make_metadata_backend();
      ctx.context.metadata = metadata;

      const manifest = make_manifest(["metadata:read"]);
      const query = { filters: [], sort: [], limit: 10, offset: 0 };
      const response = await handler.handle_request(PLUGIN_ID, manifest, {
        id: "m1",
        method: "metadata.query",
        params: [query],
      });

      expect(response.error).toBeUndefined();
      expect(response.result).toEqual({ rows: [], total: 0 });
      expect(metadata.query).toHaveBeenCalledWith(query);
    });

    it("metadata.list_properties returns results when metadata:read is granted", async () => {
      grant_permissions("metadata:read");
      const metadata = make_metadata_backend();
      ctx.context.metadata = metadata;

      const manifest = make_manifest(["metadata:read"]);
      const response = await handler.handle_request(PLUGIN_ID, manifest, {
        id: "m2",
        method: "metadata.list_properties",
        params: [],
      });

      expect(response.error).toBeUndefined();
      expect(response.result).toEqual([
        {
          name: "status",
          property_type: "string",
          count: 5,
          unique_values: null,
        },
      ]);
      expect(metadata.list_properties).toHaveBeenCalled();
    });

    it("metadata.get_backlinks returns results when metadata:read is granted", async () => {
      grant_permissions("metadata:read");
      const metadata = make_metadata_backend();
      ctx.context.metadata = metadata;

      const manifest = make_manifest(["metadata:read"]);
      const response = await handler.handle_request(PLUGIN_ID, manifest, {
        id: "m3",
        method: "metadata.get_backlinks",
        params: ["notes/target.md"],
      });

      expect(response.error).toBeUndefined();
      expect(response.result).toEqual([{ path: "notes/linking.md" }]);
      expect(metadata.get_backlinks).toHaveBeenCalledWith("notes/target.md");
    });

    it("metadata.get_stats returns results when metadata:read is granted", async () => {
      grant_permissions("metadata:read");
      const metadata = make_metadata_backend();
      ctx.context.metadata = metadata;

      const manifest = make_manifest(["metadata:read"]);
      const response = await handler.handle_request(PLUGIN_ID, manifest, {
        id: "m4",
        method: "metadata.get_stats",
        params: ["notes/target.md"],
      });

      expect(response.error).toBeUndefined();
      expect(response.result).toEqual({
        word_count: 120,
        char_count: 800,
        heading_count: 3,
        outlink_count: 2,
        reading_time_secs: 48,
        last_indexed_at: 1700000000,
      });
      expect(metadata.get_stats).toHaveBeenCalledWith("notes/target.md");
    });

    it("metadata.* blocks when metadata:read is not granted", async () => {
      grant_permissions();
      ctx.context.metadata = make_metadata_backend();

      const manifest = make_manifest(["metadata:read"]);
      const response = await handler.handle_request(PLUGIN_ID, manifest, {
        id: "m5",
        method: "metadata.query",
        params: [{ filters: [], sort: [], limit: 10, offset: 0 }],
      });

      expect(response.error).toMatch(/Missing metadata:read permission/);
    });

    it("metadata.list_properties blocks when metadata:read is not granted", async () => {
      grant_permissions();
      ctx.context.metadata = make_metadata_backend();

      const manifest = make_manifest(["metadata:read"]);
      const response = await handler.handle_request(PLUGIN_ID, manifest, {
        id: "m5b",
        method: "metadata.list_properties",
        params: [],
      });

      expect(response.error).toMatch(/Missing metadata:read permission/);
    });

    it("metadata.get_backlinks blocks when metadata:read is not granted", async () => {
      grant_permissions();
      ctx.context.metadata = make_metadata_backend();

      const manifest = make_manifest(["metadata:read"]);
      const response = await handler.handle_request(PLUGIN_ID, manifest, {
        id: "m5c",
        method: "metadata.get_backlinks",
        params: ["notes/target.md"],
      });

      expect(response.error).toMatch(/Missing metadata:read permission/);
    });

    it("metadata.get_stats blocks when metadata:read is not granted", async () => {
      grant_permissions();
      ctx.context.metadata = make_metadata_backend();

      const manifest = make_manifest(["metadata:read"]);
      const response = await handler.handle_request(PLUGIN_ID, manifest, {
        id: "m5d",
        method: "metadata.get_stats",
        params: ["notes/target.md"],
      });

      expect(response.error).toMatch(/Missing metadata:read permission/);
    });

    it("metadata.getFileCache returns composite cache when metadata:read is granted", async () => {
      grant_permissions("metadata:read");
      const metadata = make_metadata_backend();
      ctx.context.metadata = metadata;

      const manifest = make_manifest(["metadata:read"]);
      const response = await handler.handle_request(PLUGIN_ID, manifest, {
        id: "m-fc1",
        method: "metadata.getFileCache",
        params: ["notes/target.md"],
      });

      expect(response.error).toBeUndefined();
      expect(response.result).toBeDefined();
      const cache = response.result as Record<string, unknown>;
      expect(cache.ctime_ms).toBe(50);
      expect(cache.mtime_ms).toBe(100);
      expect((cache.headings as unknown[]).length).toBe(1);
      expect(metadata.get_file_cache).toHaveBeenCalledWith("notes/target.md");
    });

    it("metadata.getFileCache blocks when metadata:read is not granted", async () => {
      grant_permissions();
      ctx.context.metadata = make_metadata_backend();

      const manifest = make_manifest(["metadata:read"]);
      const response = await handler.handle_request(PLUGIN_ID, manifest, {
        id: "m-fc2",
        method: "metadata.getFileCache",
        params: ["notes/target.md"],
      });

      expect(response.error).toMatch(/Missing metadata:read permission/);
    });

    it("metadata.* errors on unknown action", async () => {
      grant_permissions("metadata:read");
      ctx.context.metadata = make_metadata_backend();

      const manifest = make_manifest(["metadata:read"]);
      const response = await handler.handle_request(PLUGIN_ID, manifest, {
        id: "m6",
        method: "metadata.unknown_action",
        params: [],
      });

      expect(response.error).toMatch(/Unknown metadata action: unknown_action/);
    });

    it("metadata.* errors when metadata backend not initialized", async () => {
      grant_permissions("metadata:read");

      const manifest = make_manifest(["metadata:read"]);
      const response = await handler.handle_request(PLUGIN_ID, manifest, {
        id: "m7",
        method: "metadata.list_properties",
        params: [],
      });

      expect(response.error).toMatch(/Metadata backend not initialized/);
    });
  });

  describe("diagnostics.*", () => {
    function make_diagnostics_backend() {
      return {
        push: vi.fn(),
        clear: vi.fn(),
      };
    }

    it("diagnostics.push pushes diagnostics with plugin-scoped source", async () => {
      grant_permissions("diagnostics:write");
      const diag = make_diagnostics_backend();
      ctx.context.diagnostics = diag;

      const manifest = make_manifest(["diagnostics:write"]);
      const response = await handler.handle_request(PLUGIN_ID, manifest, {
        id: "d1",
        method: "diagnostics.push",
        params: [
          "notes/test.md",
          [
            {
              line: 1,
              column: 0,
              end_line: 1,
              end_column: 10,
              severity: "warning",
              message: "Heading too long",
              rule_id: "heading-length",
              fixable: false,
            },
          ],
        ],
      });

      expect(response.error).toBeUndefined();
      expect(response.result).toEqual({ success: true });
      expect(diag.push).toHaveBeenCalledWith(
        `plugin:${PLUGIN_ID}`,
        "notes/test.md",
        [
          {
            source: `plugin:${PLUGIN_ID}`,
            line: 1,
            column: 0,
            end_line: 1,
            end_column: 10,
            severity: "warning",
            message: "Heading too long",
            rule_id: "heading-length",
            fixable: false,
          },
        ],
      );
    });

    it("diagnostics.push rejects invalid severity", async () => {
      grant_permissions("diagnostics:write");
      ctx.context.diagnostics = make_diagnostics_backend();

      const manifest = make_manifest(["diagnostics:write"]);
      const response = await handler.handle_request(PLUGIN_ID, manifest, {
        id: "d2",
        method: "diagnostics.push",
        params: [
          "notes/test.md",
          [
            {
              line: 1,
              column: 0,
              end_line: 1,
              end_column: 5,
              severity: "critical",
              message: "bad",
            },
          ],
        ],
      });

      expect(response.error).toMatch(/Invalid diagnostics\[0\]\.severity/);
    });

    it("diagnostics.clear clears all diagnostics for the plugin", async () => {
      grant_permissions("diagnostics:write");
      const diag = make_diagnostics_backend();
      ctx.context.diagnostics = diag;

      const manifest = make_manifest(["diagnostics:write"]);
      const response = await handler.handle_request(PLUGIN_ID, manifest, {
        id: "d3",
        method: "diagnostics.clear",
        params: [],
      });

      expect(response.error).toBeUndefined();
      expect(response.result).toEqual({ success: true });
      expect(diag.clear).toHaveBeenCalledWith(`plugin:${PLUGIN_ID}`, undefined);
    });

    it("diagnostics.clear clears diagnostics for a specific file", async () => {
      grant_permissions("diagnostics:write");
      const diag = make_diagnostics_backend();
      ctx.context.diagnostics = diag;

      const manifest = make_manifest(["diagnostics:write"]);
      const response = await handler.handle_request(PLUGIN_ID, manifest, {
        id: "d4",
        method: "diagnostics.clear",
        params: ["notes/test.md"],
      });

      expect(response.error).toBeUndefined();
      expect(diag.clear).toHaveBeenCalledWith(
        `plugin:${PLUGIN_ID}`,
        "notes/test.md",
      );
    });

    it("diagnostics.* blocks when diagnostics:write is not granted", async () => {
      grant_permissions();
      ctx.context.diagnostics = make_diagnostics_backend();

      const manifest = make_manifest(["diagnostics:write"]);
      const response = await handler.handle_request(PLUGIN_ID, manifest, {
        id: "d5",
        method: "diagnostics.push",
        params: ["notes/test.md", []],
      });

      expect(response.error).toMatch(/Missing diagnostics:write permission/);
    });

    it("diagnostics.* errors when diagnostics backend not initialized", async () => {
      grant_permissions("diagnostics:write");

      const manifest = make_manifest(["diagnostics:write"]);
      const response = await handler.handle_request(PLUGIN_ID, manifest, {
        id: "d6",
        method: "diagnostics.push",
        params: ["notes/test.md", []],
      });

      expect(response.error).toMatch(/Diagnostics backend not initialized/);
    });
  });

  describe("mcp.*", () => {
    function setup_mcp() {
      const list_tool_definitions = vi.fn().mockResolvedValue([
        {
          name: "list_notes",
          description: "List notes",
          inputSchema: { type: "object", properties: {}, required: [] },
        },
      ]);
      const call_tool = vi.fn().mockResolvedValue({
        content: [{ type: "text", text: "result" }],
        isError: false,
      });
      ctx.context.mcp = { list_tool_definitions, call_tool };
      return { list_tool_definitions, call_tool };
    }

    it("lists native tools via mcp.list_tools", async () => {
      grant_permissions("mcp:access");
      const { list_tool_definitions } = setup_mcp();

      const manifest = make_manifest(["mcp:access"]);
      const response = await handler.handle_request(PLUGIN_ID, manifest, {
        id: "m1",
        method: "mcp.list_tools",
        params: [],
      });

      expect(response.error).toBeUndefined();
      expect(list_tool_definitions).toHaveBeenCalled();
      const result = response.result as unknown[];
      expect(result).toHaveLength(1);
    });

    it("calls a tool via mcp.call_tool", async () => {
      grant_permissions("mcp:access");
      const { call_tool } = setup_mcp();

      const manifest = make_manifest(["mcp:access"]);
      const response = await handler.handle_request(PLUGIN_ID, manifest, {
        id: "m2",
        method: "mcp.call_tool",
        params: ["list_notes", { vault_id: "test" }],
      });

      expect(response.error).toBeUndefined();
      expect(call_tool).toHaveBeenCalledWith("list_notes", {
        vault_id: "test",
      });
    });

    it("registers a plugin tool via mcp.register_tool", async () => {
      grant_permissions("mcp:access", "mcp:register");
      setup_mcp();

      const manifest = make_manifest(["mcp:access", "mcp:register"]);
      const response = await handler.handle_request(PLUGIN_ID, manifest, {
        id: "m3",
        method: "mcp.register_tool",
        params: [
          {
            name: "my_tool",
            description: "A plugin tool",
            inputSchema: {
              type: "object",
              properties: {},
              required: [],
            },
          },
        ],
      });

      expect(response.error).toBeUndefined();
      const result = response.result as { success: boolean; name: string };
      expect(result.success).toBe(true);
      expect(result.name).toBe("test-plugin:my_tool");

      const tools = handler.get_registered_tools();
      expect(tools).toHaveLength(1);
      const first_tool = tools[0]!;
      expect(first_tool.plugin_id).toBe("test-plugin");
      expect(first_tool.definition.name).toBe("test-plugin:my_tool");
    });

    it("includes registered plugin tools in list_tools", async () => {
      grant_permissions("mcp:access", "mcp:register");
      setup_mcp();

      const manifest = make_manifest(["mcp:access", "mcp:register"]);
      await handler.handle_request(PLUGIN_ID, manifest, {
        id: "m4a",
        method: "mcp.register_tool",
        params: [
          {
            name: "plugin_tool",
            description: "From plugin",
            inputSchema: { type: "object", properties: {}, required: [] },
          },
        ],
      });

      const response = await handler.handle_request(PLUGIN_ID, manifest, {
        id: "m4b",
        method: "mcp.list_tools",
        params: [],
      });

      expect(response.error).toBeUndefined();
      const result = response.result as Array<{ name: string }>;
      expect(result).toHaveLength(2);
      expect(result.map((t) => t.name)).toContain("test-plugin:plugin_tool");
    });

    it("blocks mcp access without permission", async () => {
      grant_permissions();
      setup_mcp();

      const manifest = make_manifest([]);
      const response = await handler.handle_request(PLUGIN_ID, manifest, {
        id: "m5",
        method: "mcp.list_tools",
        params: [],
      });

      expect(response.error).toMatch(/Missing mcp:access permission/);
    });

    it("blocks register_tool without mcp:register permission", async () => {
      grant_permissions("mcp:access");
      setup_mcp();

      const manifest = make_manifest(["mcp:access"]);
      const response = await handler.handle_request(PLUGIN_ID, manifest, {
        id: "m6",
        method: "mcp.register_tool",
        params: [
          {
            name: "blocked_tool",
            description: "Should fail",
          },
        ],
      });

      expect(response.error).toMatch(/Missing mcp:register permission/);
    });

    it("errors when mcp backend not initialized", async () => {
      grant_permissions("mcp:access");

      const manifest = make_manifest(["mcp:access"]);
      const response = await handler.handle_request(PLUGIN_ID, manifest, {
        id: "m7",
        method: "mcp.list_tools",
        params: [],
      });

      expect(response.error).toMatch(/MCP backend not initialized/);
    });
  });

  describe("commands.register_slash", () => {
    it("registers a slash command with namespaced id", async () => {
      grant_permissions("commands:register");
      const manifest = make_manifest(["commands:register"]);

      const response = await handler.handle_request(PLUGIN_ID, manifest, {
        id: "s1",
        method: "commands.register_slash",
        params: [
          {
            id: "cite",
            name: "Cite",
            description: "Insert a citation",
            icon: "📚",
            keywords: ["citation", "reference"],
          },
        ],
      });

      expect(response.error).toBeUndefined();
      expect(response.result).toEqual({ success: true });
      expect(ctx.plugin.register_slash_command).toHaveBeenCalledWith({
        id: `${PLUGIN_ID}:cite`,
        name: "Cite",
        description: "Insert a citation",
        icon: "📚",
        keywords: ["citation", "reference"],
        plugin_id: PLUGIN_ID,
      });
    });

    it("registers slash command without optional fields", async () => {
      grant_permissions("commands:register");
      const manifest = make_manifest(["commands:register"]);

      const response = await handler.handle_request(PLUGIN_ID, manifest, {
        id: "s2",
        method: "commands.register_slash",
        params: [
          {
            id: "do-thing",
            name: "Do Thing",
            description: "Does a thing",
          },
        ],
      });

      expect(response.error).toBeUndefined();
      const call_arg = ctx.plugin.register_slash_command.mock.calls[0]?.[0];
      expect(call_arg.id).toBe(`${PLUGIN_ID}:do-thing`);
      expect(call_arg.name).toBe("Do Thing");
      expect(call_arg).not.toHaveProperty("icon");
      expect(call_arg).not.toHaveProperty("keywords");
    });

    it("rejects slash command registration without permission", async () => {
      const manifest = make_manifest([]);
      const response = await handler.handle_request(PLUGIN_ID, manifest, {
        id: "s3",
        method: "commands.register_slash",
        params: [
          {
            id: "cite",
            name: "Cite",
            description: "Insert a citation",
          },
        ],
      });

      expect(response.error).toMatch(/Missing commands:register permission/);
    });
  });

  describe("commands.remove_slash", () => {
    it("removes a slash command with namespaced id", async () => {
      grant_permissions("commands:register");
      const manifest = make_manifest(["commands:register"]);

      const response = await handler.handle_request(PLUGIN_ID, manifest, {
        id: "s4",
        method: "commands.remove_slash",
        params: ["cite"],
      });

      expect(response.error).toBeUndefined();
      expect(ctx.plugin.unregister_slash_command).toHaveBeenCalledWith(
        `${PLUGIN_ID}:cite`,
      );
    });
  });
});
