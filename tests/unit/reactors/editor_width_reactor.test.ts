import { describe, expect, it } from "vitest";
import { UIStore } from "$lib/app";
import { create_editor_width_reactor } from "$lib/reactors/editor_width.reactor.svelte";

describe("editor_width.reactor", () => {
  it("returns a cleanup function", () => {
    const unmount = create_editor_width_reactor(new UIStore());

    expect(typeof unmount).toBe("function");

    unmount();
  });
});
