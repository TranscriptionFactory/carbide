// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { flushSync } from "svelte";
import { UIStore } from "$lib/app/orchestration/ui_store.svelte";
import { create_toolchain_lifecycle_reactor } from "$lib/reactors/toolchain_lifecycle.reactor.svelte";
import type { ToolchainService } from "$lib/features/toolchain";

function fake_service() {
  const load = vi.fn(() => Promise.resolve());
  return { service: { load } as unknown as ToolchainService, load };
}

describe("toolchain lifecycle reactor", () => {
  it("does not load tools until the settings dialog opens", () => {
    const ui = new UIStore();
    const { service, load } = fake_service();
    const stop = create_toolchain_lifecycle_reactor(ui, service);
    flushSync();

    expect(load).not.toHaveBeenCalled();

    ui.settings_dialog.open = true;
    flushSync();

    expect(load).toHaveBeenCalledTimes(1);
    stop();
  });

  it("reloads each time the dialog is reopened, not while it stays open", () => {
    const ui = new UIStore();
    const { service, load } = fake_service();
    const stop = create_toolchain_lifecycle_reactor(ui, service);

    ui.settings_dialog.open = true;
    flushSync();
    ui.settings_dialog.active_category = "editor";
    flushSync();
    expect(load).toHaveBeenCalledTimes(1);

    ui.settings_dialog.open = false;
    flushSync();
    ui.settings_dialog.open = true;
    flushSync();

    expect(load).toHaveBeenCalledTimes(2);
    stop();
  });
});
