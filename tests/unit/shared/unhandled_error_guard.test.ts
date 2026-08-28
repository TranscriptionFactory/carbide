import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { install_unhandled_error_guard } from "$lib/shared/utils/unhandled_error_guard";

const { log_error } = vi.hoisted(() => ({ log_error: vi.fn() }));

vi.mock("$lib/shared/utils/logger", () => ({
  create_logger: () => ({ error: log_error }),
}));

vi.spyOn(console, "error").mockImplementation(() => {});

type Handler = (event: unknown) => void;

function create_target() {
  const handlers = new Map<string, Handler>();
  const target = {
    addEventListener: (type: string, handler: Handler) =>
      handlers.set(type, handler),
    removeEventListener: (type: string) => handlers.delete(type),
  };
  return {
    target: target as unknown as Window,
    fire: (type: string, event: unknown) => {
      handlers.get(type)?.(event);
    },
  };
}

function error_event(error: unknown) {
  return { preventDefault: vi.fn(), error };
}

function rejection_event(reason: unknown) {
  return { preventDefault: vi.fn(), reason };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-27T00:00:00Z"));
  log_error.mockClear();
  (console.error as ReturnType<typeof vi.fn>).mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("install_unhandled_error_guard", () => {
  it("logs the stack of an unhandled error alongside its message", () => {
    const { target, fire } = create_target();
    const toast_error = vi.fn();
    install_unhandled_error_guard(target, toast_error);

    const error = new Error("no position before the top-level node");
    const stack = [
      "Error: no position before the top-level node",
      "    at ResolvedPos.before (prosemirror-model/dist/index.js:884)",
    ].join("\n");
    error.stack = stack;
    fire("error", error_event(error));

    expect(log_error).toHaveBeenCalledWith("Unhandled error", {
      error: "no position before the top-level node",
      stack,
    });
    expect(toast_error).toHaveBeenCalledWith(
      "no position before the top-level node",
    );
  });

  it("logs the stack of an unhandled rejection from event.reason", () => {
    const { target, fire } = create_target();
    const toast_error = vi.fn();
    install_unhandled_error_guard(target, toast_error);

    const reason = Object.assign(new Error("async boom"), {
      stack: "Error: async boom\n    at async tick (scheduler.ts:7)",
    });
    fire("unhandledrejection", rejection_event(reason));

    expect(log_error).toHaveBeenCalledWith("Unhandled rejection", {
      error: "async boom",
      stack: "Error: async boom\n    at async tick (scheduler.ts:7)",
    });
  });

  it("omits the stack key when the error carries none", () => {
    const { target, fire } = create_target();
    install_unhandled_error_guard(target, vi.fn());

    fire("error", error_event("plain string failure"));

    expect(log_error).toHaveBeenCalledWith("Unhandled error", {
      error: "plain string failure",
    });
  });

  it("prevents the browser default and ignores falsy errors", () => {
    const { target, fire } = create_target();
    const toast_error = vi.fn();
    install_unhandled_error_guard(target, toast_error);
    const event = error_event(null);
    fire("error", event);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(log_error).not.toHaveBeenCalled();
    expect(toast_error).not.toHaveBeenCalled();
  });

  it("keeps the 3s toast throttle while logging every error", () => {
    const { target, fire } = create_target();
    const toast_error = vi.fn();
    install_unhandled_error_guard(target, toast_error);

    fire("error", error_event(new Error("first")));
    vi.advanceTimersByTime(1_000);
    fire("error", error_event(new Error("second")));
    vi.advanceTimersByTime(1_000);
    fire("error", error_event(new Error("third")));

    expect(log_error).toHaveBeenCalledTimes(3);
    expect(toast_error).toHaveBeenCalledTimes(1);
    expect(toast_error).toHaveBeenCalledWith("first");

    vi.advanceTimersByTime(3_001);
    fire("error", error_event(new Error("fourth")));

    expect(log_error).toHaveBeenCalledTimes(4);
    expect(toast_error).toHaveBeenCalledTimes(2);
    expect(toast_error).toHaveBeenLastCalledWith("fourth");
  });

  it("stops listening once disposed", () => {
    const { target, fire } = create_target();
    const toast_error = vi.fn();
    const dispose = install_unhandled_error_guard(target, toast_error);
    dispose();

    fire("error", error_event(new Error("late")));
    fire("unhandledrejection", rejection_event(new Error("late rejection")));

    expect(log_error).not.toHaveBeenCalled();
    expect(toast_error).not.toHaveBeenCalled();
  });
});
