import { describe, expect, it } from "vitest";

import { create_app_stores } from "$lib/app/bootstrap/create_app_stores";

describe("create_app_stores", () => {
  it("does not instantiate full-only stores for lite", () => {
    const stores = create_app_stores("lite");

    expect(stores.ai).toBeUndefined();
    expect(stores.plugin).toBeUndefined();
    expect(stores.plugin_settings).toBeUndefined();
    expect(stores.canvas).toBeUndefined();
    expect(stores.tag).toBeUndefined();
    expect(stores.metadata).toBeUndefined();
    expect(stores.toolchain).toBeUndefined();
    expect(stores.code_lsp).toBeUndefined();
    expect(stores.query).toBeUndefined();
    expect(stores.reference).toBeUndefined();
  });

  it("keeps full-only stores in full mode", () => {
    const stores = create_app_stores("full");

    expect(stores.ai).toBeDefined();
    expect(stores.plugin).toBeDefined();
    expect(stores.plugin_settings).toBeDefined();
    expect(stores.canvas).toBeDefined();
    expect(stores.tag).toBeDefined();
    expect(stores.metadata).toBeDefined();
    expect(stores.toolchain).toBeDefined();
    expect(stores.code_lsp).toBeDefined();
    expect(stores.query).toBeDefined();
    expect(stores.reference).toBeDefined();
  });
});
