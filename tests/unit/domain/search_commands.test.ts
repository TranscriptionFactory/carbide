import { describe, expect, it } from "vitest";
import {
  COMMANDS_REGISTRY,
  SIDEBAR_VIEW_COMMAND_PREFIX,
  sidebar_view_command_id,
  sidebar_view_commands,
  is_sidebar_view_command,
} from "$lib/features/search/domain/search_commands";
import { SIDEBAR_VIEW_REGISTRY } from "$lib/app/sidebar_views";
import type { DynamicSidebarView } from "$lib/app/sidebar_views";
import type { CommandContext } from "$lib/features/search/types/command_context";

function ctx(is_vault_mode: boolean): CommandContext {
  return { is_vault_mode } as unknown as CommandContext;
}

describe("sidebar view commands", () => {
  it("generates one command per registry view with stable prefixed ids", () => {
    for (const view of SIDEBAR_VIEW_REGISTRY) {
      const id = sidebar_view_command_id(view.id);
      const command = COMMANDS_REGISTRY.find((c) => c.id === id);
      expect(command).toBeDefined();
      expect(command?.id).toBe(`${SIDEBAR_VIEW_COMMAND_PREFIX}${view.id}`);
      expect(command?.label).toBe(`Go to ${view.label}`);
      expect(command?.icon).toBe(view.command_icon);
    }
  });

  it("round-trips sidebar_view_command_id and is_sidebar_view_command", () => {
    const id = sidebar_view_command_id("graph");
    expect(is_sidebar_view_command(id)).toBe(true);
    expect(id.slice(SIDEBAR_VIEW_COMMAND_PREFIX.length)).toBe("graph");
    expect(is_sidebar_view_command("open_settings")).toBe(false);
  });

  it("gates vault_only views behind is_vault_mode", () => {
    const graph = COMMANDS_REGISTRY.find(
      (c) => c.id === sidebar_view_command_id("graph"),
    );
    expect(graph?.when?.(ctx(false))).toBe(false);
    expect(graph?.when?.(ctx(true))).toBe(true);
  });

  it("leaves the explorer command always available", () => {
    const explorer = COMMANDS_REGISTRY.find(
      (c) => c.id === sidebar_view_command_id("explorer"),
    );
    expect(explorer?.when).toBeUndefined();
  });

  it("registers the sidebar meta commands", () => {
    expect(
      COMMANDS_REGISTRY.find((c) => c.id === "configure_sidebar"),
    ).toBeDefined();
    expect(
      COMMANDS_REGISTRY.find((c) => c.id === "open_sidebar_switcher"),
    ).toBeDefined();
  });
});

describe("sidebar_view_commands with dynamic views", () => {
  const ICON = {} as DynamicSidebarView["icon"];
  const references: DynamicSidebarView = {
    id: "references",
    label: "References",
    icon: ICON,
    keywords: ["citations"],
  };

  it("generates commands for dynamic views alongside static ones", () => {
    const commands = sidebar_view_commands([references]);

    for (const view of SIDEBAR_VIEW_REGISTRY) {
      expect(
        commands.some((c) => c.id === sidebar_view_command_id(view.id)),
      ).toBe(true);
    }

    const command = commands.find(
      (c) => c.id === sidebar_view_command_id("references"),
    );
    expect(command?.label).toBe("Go to References");
    expect(command?.keywords).toContain("citations");
  });

  it("gates dynamic view commands behind vault mode", () => {
    const commands = sidebar_view_commands([references]);
    const command = commands.find(
      (c) => c.id === sidebar_view_command_id("references"),
    );
    expect(command?.when?.(ctx(false))).toBe(false);
    expect(command?.when?.(ctx(true))).toBe(true);
  });
});
