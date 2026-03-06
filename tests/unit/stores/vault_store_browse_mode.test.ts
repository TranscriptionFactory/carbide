import { describe, expect, it } from "vitest";
import { VaultStore } from "$lib/features/vault/state/vault_store.svelte";
import { create_test_vault } from "../helpers/test_fixtures";

describe("VaultStore browse mode", () => {
  it("is_vault_mode returns true when vault mode is vault", () => {
    const store = new VaultStore();
    store.set_vault(create_test_vault({ mode: "vault" }));

    expect(store.is_vault_mode).toBe(true);
  });

  it("is_vault_mode returns false when vault mode is browse", () => {
    const store = new VaultStore();
    store.set_vault(create_test_vault({ mode: "browse" }));

    expect(store.is_vault_mode).toBe(false);
  });

  it("is_vault_mode returns false when no vault is set", () => {
    const store = new VaultStore();

    expect(store.is_vault_mode).toBe(false);
  });

  it("is_vault_mode updates when vault changes from browse to vault", () => {
    const store = new VaultStore();
    store.set_vault(create_test_vault({ mode: "browse" }));
    expect(store.is_vault_mode).toBe(false);

    store.set_vault(create_test_vault({ mode: "vault" }));
    expect(store.is_vault_mode).toBe(true);
  });

  it("is_vault_mode returns false after clear", () => {
    const store = new VaultStore();
    store.set_vault(create_test_vault({ mode: "vault" }));
    expect(store.is_vault_mode).toBe(true);

    store.clear();
    expect(store.is_vault_mode).toBe(false);
  });
});
