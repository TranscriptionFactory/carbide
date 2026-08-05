import { vi } from "vitest";
import { flushSync } from "svelte";

type ListenHandler = (event: { payload: unknown }) => void;

type MockedListen = {
  mockImplementation: (
    impl: (event_name: string, handler: unknown) => Promise<() => void>,
  ) => unknown;
};

// Pairs with a per-file `vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }))`
// (vi.mock hoisting keeps that call in the test file). Captures every handler
// registered through the mocked `listen` and returns an emitter for them.
export function capture_tauri_listen(mock_listen: MockedListen) {
  const handlers: ListenHandler[] = [];
  const unlisten = vi.fn();
  mock_listen.mockImplementation((_event_name, handler) => {
    handlers.push(handler as ListenHandler);
    return Promise.resolve(unlisten);
  });
  return {
    unlisten,
    emit: (payload: unknown) => {
      for (const handler of handlers) {
        handler({ payload });
      }
    },
  };
}

export async function flush_effects() {
  flushSync();
  for (let i = 0; i < 5; i += 1) {
    await Promise.resolve();
  }
}
