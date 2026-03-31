import { describe, expect, it, vi } from "vitest";
import { create_reference_library_load_reactor } from "$lib/reactors/reference_library_load.reactor.svelte";
import type { ReferenceService } from "$lib/features/reference";

function make_mock_vault_store(vault_id: string | null) {
  return { active_vault_id: vault_id } as never;
}

function make_mock_reference_service() {
  return { load_library: vi.fn(async () => {}) } as unknown as ReferenceService;
}

describe("reference_library_load.reactor", () => {
  it("returns a cleanup function", () => {
    const unmount = create_reference_library_load_reactor(
      make_mock_vault_store("v1"),
      make_mock_reference_service(),
    );

    expect(typeof unmount).toBe("function");
    unmount();
  });

  it("does not call load_library when vault_id is null", () => {
    const service = make_mock_reference_service();
    const unmount = create_reference_library_load_reactor(
      make_mock_vault_store(null),
      service,
    );

    expect(service.load_library).not.toHaveBeenCalled();
    unmount();
  });
});
