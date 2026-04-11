import { describe, it, expect, vi } from "vitest";
import {
  to_editor_slash_commands,
  type PluginSlashCommand,
  type SlashCommandExecutor,
} from "$lib/features/plugin/domain/plugin_slash_commands";

function make_slash_cmd(
  overrides?: Partial<PluginSlashCommand>,
): PluginSlashCommand {
  return {
    id: "cite-plugin:cite",
    name: "Cite",
    description: "Insert a citation",
    plugin_id: "cite-plugin",
    ...overrides,
  };
}

describe("to_editor_slash_commands", () => {
  it("converts plugin slash commands to editor format", () => {
    const executor: SlashCommandExecutor = vi.fn();
    const commands = to_editor_slash_commands(
      [make_slash_cmd()],
      executor,
      () => "Citation Plugin",
    );

    expect(commands).toHaveLength(1);
    expect(commands[0]?.id).toBe("cite-plugin:cite");
    expect(commands[0]?.label).toBe("Cite");
    expect(commands[0]?.description).toBe("Insert a citation");
    expect(commands[0]?.source).toBe("plugin");
    expect(commands[0]?.plugin_name).toBe("Citation Plugin");
  });

  it("uses default icon when none provided", () => {
    const { icon: _, ...without_icon } = make_slash_cmd();
    const commands = to_editor_slash_commands(
      [without_icon as PluginSlashCommand],
      vi.fn(),
      () => "P",
    );
    expect(commands[0]?.icon).toBe("⚡");
  });

  it("uses custom icon when provided", () => {
    const commands = to_editor_slash_commands(
      [make_slash_cmd({ icon: "📚" })],
      vi.fn(),
      () => "P",
    );
    expect(commands[0]?.icon).toBe("📚");
  });

  it("uses custom keywords when provided", () => {
    const commands = to_editor_slash_commands(
      [make_slash_cmd({ keywords: ["reference", "bib"] })],
      vi.fn(),
      () => "P",
    );
    expect(commands[0]?.keywords).toEqual(["reference", "bib"]);
  });

  it("falls back to name as keyword when none provided", () => {
    const { keywords: _, ...without_keywords } = make_slash_cmd();
    const commands = to_editor_slash_commands(
      [without_keywords as PluginSlashCommand],
      vi.fn(),
      () => "P",
    );
    expect(commands[0]?.keywords).toEqual(["Cite"]);
  });

  it("resolves plugin name via getter", () => {
    const commands = to_editor_slash_commands(
      [make_slash_cmd({ plugin_id: "my-plugin" })],
      vi.fn(),
      (id) => (id === "my-plugin" ? "My Plugin" : "Unknown"),
    );
    expect(commands[0]?.plugin_name).toBe("My Plugin");
  });

  it("handles multiple commands from different plugins", () => {
    const commands = to_editor_slash_commands(
      [
        make_slash_cmd({ id: "a:cmd1", plugin_id: "a" }),
        make_slash_cmd({ id: "b:cmd2", plugin_id: "b" }),
      ],
      vi.fn(),
      (id) => id.toUpperCase(),
    );
    expect(commands).toHaveLength(2);
    expect(commands[0]?.plugin_name).toBe("A");
    expect(commands[1]?.plugin_name).toBe("B");
  });

  it("strips plugin prefix from command name when calling executor", () => {
    const executor = vi.fn().mockResolvedValue(null);
    const commands = to_editor_slash_commands(
      [make_slash_cmd({ id: "cite-plugin:cite", plugin_id: "cite-plugin" })],
      executor,
      () => "P",
    );

    const mock_view = {
      state: {
        selection: { from: 5 },
        doc: { content: { size: 100 } },
        tr: {
          delete: vi.fn().mockReturnThis(),
          insertText: vi.fn().mockReturnThis(),
          scrollIntoView: vi.fn().mockReturnThis(),
        },
      },
      dispatch: vi.fn(),
      focus: vi.fn(),
      dom: { isConnected: true },
    } as any;

    commands[0]?.insert(mock_view, 0);
    expect(executor).toHaveBeenCalledWith("cite-plugin", "cite", {
      cursor_position: 0,
    });
  });
});
