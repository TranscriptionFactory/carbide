import { create_logger } from "$lib/shared/utils/logger";
import { error_message } from "$lib/shared/utils/error_message";

type GuardTarget = Pick<Window, "addEventListener" | "removeEventListener">;

type ErrorToast = (message: string) => void;

const TOAST_THROTTLE_MS = 3000;

function error_stack(origin: unknown): string | undefined {
  if (typeof origin !== "object" || origin === null) return undefined;
  const stack = (origin as { stack?: unknown }).stack;
  return typeof stack === "string" && stack.length > 0 ? stack : undefined;
}

export function install_unhandled_error_guard(
  target: GuardTarget,
  error_toast: ErrorToast,
): () => void {
  const log = create_logger("app");
  let last_toast_time = 0;

  function throttled_error_toast(
    label: string,
    detail: string,
    origin?: unknown,
  ) {
    console.error(`[${label}]`, origin ?? detail);
    const stack = error_stack(origin);
    log.error(label, { error: detail, ...(stack ? { stack } : {}) });
    const now = Date.now();
    if (now - last_toast_time < TOAST_THROTTLE_MS) return;
    last_toast_time = now;
    error_toast(detail || "Something went wrong");
  }

  const on_error = (event: ErrorEvent) => {
    event.preventDefault();
    if (!event.error) return;
    throttled_error_toast(
      "Unhandled error",
      error_message(event.error),
      event.error,
    );
  };

  const on_rejection = (event: PromiseRejectionEvent) => {
    event.preventDefault();
    if (!event.reason) return;
    throttled_error_toast(
      "Unhandled rejection",
      error_message(event.reason),
      event.reason,
    );
  };

  target.addEventListener("error", on_error as EventListener);
  target.addEventListener("unhandledrejection", on_rejection as EventListener);

  return () => {
    target.removeEventListener("error", on_error as EventListener);
    target.removeEventListener(
      "unhandledrejection",
      on_rejection as EventListener,
    );
  };
}
