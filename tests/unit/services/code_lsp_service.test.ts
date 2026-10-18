import { describe, expect, it, vi } from "vitest";
import { CodeLspService } from "$lib/features/code_lsp/application/code_lsp_service";
import { CodeLspStore } from "$lib/features/code_lsp/state/code_lsp_store.svelte";
import { DiagnosticsStore } from "$lib/features/diagnostics/state/diagnostics_store.svelte";
import type { CodeLspPort } from "$lib/features/code_lsp/ports";
import type {
  CodeLspEvent,
  CodeLspStatus,
} from "$lib/features/code_lsp/types/code_lsp";

const JSON_REASON =
  "vscode-json-language-server not found on PATH; install it with `npm install -g vscode-langservers-extracted`, then restart Carbide";

function create_service() {
  let emit: ((event: CodeLspEvent) => void) | null = null;
  const port = {
    subscribe_events: vi.fn((callback: (event: CodeLspEvent) => void) => {
      emit = callback;
      return () => {};
    }),
  } as unknown as CodeLspPort;
  const store = new CodeLspStore();
  const service = new CodeLspService(port, store, new DiagnosticsStore());
  service.start();

  const emit_status = (language: string, status: CodeLspStatus) =>
    emit?.({
      type: "server_status_changed",
      vault_id: "vault-1",
      language,
      status,
    });
  return { service, store, emit_status };
}

describe("CodeLspService server status", () => {
  it("records an unavailable server with the reason the backend gave", () => {
    const { store, emit_status } = create_service();

    emit_status("json", {
      unavailable: { language: "json", reason: JSON_REASON },
    });

    expect(store.server_statuses.get("json")).toBe("unavailable");
    expect(store.unavailable_reasons.get("json")).toBe(JSON_REASON);
  });

  it("drops the reason once the server reports another status", () => {
    const { store, emit_status } = create_service();
    emit_status("json", {
      unavailable: { language: "json", reason: JSON_REASON },
    });

    emit_status("json", "running");

    expect(store.server_statuses.get("json")).toBe("running");
    expect(store.unavailable_reasons.has("json")).toBe(false);
  });

  it("clears reasons when the service stops", () => {
    const { service, store, emit_status } = create_service();
    emit_status("json", {
      unavailable: { language: "json", reason: JSON_REASON },
    });

    service.stop();

    expect(store.unavailable_reasons.size).toBe(0);
  });
});
