import { describe, expect, it, vi } from "vitest";
import { install_drop_guard } from "$lib/shared/utils/drop_guard";

type Listener = (event: Event) => void;

function create_fake_target() {
  const listeners = new Map<string, Set<Listener>>();
  return {
    listeners,
    addEventListener: vi.fn((type: string, listener: Listener) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(listener);
    }),
    removeEventListener: vi.fn((type: string, listener: Listener) => {
      listeners.get(type)?.delete(listener);
    }),
    dispatch(type: string, event: Event) {
      for (const listener of listeners.get(type) ?? []) listener(event);
    },
  };
}

function make_event() {
  const event = { preventDefault: vi.fn() } as unknown as Event & {
    preventDefault: ReturnType<typeof vi.fn>;
  };
  return event;
}

describe("install_drop_guard", () => {
  it("registers dragover and drop listeners on the target", () => {
    const target = create_fake_target();
    install_drop_guard(target as unknown as Window);
    expect(target.addEventListener).toHaveBeenCalledWith(
      "dragover",
      expect.any(Function),
    );
    expect(target.addEventListener).toHaveBeenCalledWith(
      "drop",
      expect.any(Function),
    );
  });

  it("calls preventDefault on dragover events", () => {
    const target = create_fake_target();
    install_drop_guard(target as unknown as Window);
    const event = make_event();
    target.dispatch("dragover", event);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
  });

  it("calls preventDefault on drop events to stop WebView navigation", () => {
    const target = create_fake_target();
    install_drop_guard(target as unknown as Window);
    const event = make_event();
    target.dispatch("drop", event);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
  });

  it("dispose removes both listeners", () => {
    const target = create_fake_target();
    const dispose = install_drop_guard(target as unknown as Window);
    dispose();
    expect(target.listeners.get("dragover")?.size ?? 0).toBe(0);
    expect(target.listeners.get("drop")?.size ?? 0).toBe(0);
  });
});
