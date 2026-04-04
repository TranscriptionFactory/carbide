import { describe, expect, it } from "vitest";

import { create_app_stores } from "$lib/app/bootstrap/create_app_stores";

describe("create_app_stores", () => {
  describe.runIf(__CARBIDE_LITE__)("lite mode", () => {
    it("does not instantiate full-only stores for lite", () => {
      const stores = create_app_stores();

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
      expect(stores.graph).toBeUndefined();
      expect(stores.bases).toBeUndefined();
      expect(stores.task).toBeUndefined();
    });

    it("instantiates all core stores for lite", () => {
      const stores = create_app_stores();

      expect(stores.vault).toBeDefined();
      expect(stores.notes).toBeDefined();
      expect(stores.editor).toBeDefined();
      expect(stores.ui).toBeDefined();
      expect(stores.op).toBeDefined();
      expect(stores.search).toBeDefined();
      expect(stores.tab).toBeDefined();
      expect(stores.git).toBeDefined();
      expect(stores.links).toBeDefined();
      expect(stores.outline).toBeDefined();
      expect(stores.terminal).toBeDefined();
      expect(stores.document).toBeDefined();
      expect(stores.lint).toBeDefined();
      expect(stores.log).toBeDefined();
      expect(stores.markdown_lsp).toBeDefined();
      expect(stores.lsp).toBeDefined();
      expect(stores.diagnostics).toBeDefined();
      expect(stores.parsed_note_cache).toBeDefined();
      expect(stores.vim_nav).toBeDefined();
    });
  });

  describe.runIf(!__CARBIDE_LITE__)("full mode", () => {
    it("keeps full-only stores in full mode", () => {
      const stores = create_app_stores();

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
      expect(stores.graph).toBeDefined();
      expect(stores.bases).toBeDefined();
      expect(stores.task).toBeDefined();
    });
  });
});
