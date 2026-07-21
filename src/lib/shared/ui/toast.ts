import { toast as sonner } from "svelte-sonner";
import { create_logger } from "$lib/shared/utils/logger";

const log = create_logger("toast");

type SonnerToast = typeof sonner;

function log_toast(level: "error" | "warn", message: unknown, data?: unknown) {
  if (typeof message !== "string") return;
  const description = (data as { description?: unknown } | undefined)
    ?.description;
  const suffix = typeof description === "string" ? ` — ${description}` : "";
  log[level](`${message}${suffix}`);
}

export const toast: SonnerToast = Object.assign(
  ((...args: Parameters<SonnerToast>) => sonner(...args)) as SonnerToast,
  sonner,
  {
    error: ((message, ...rest) => {
      log_toast("error", message, rest[0]);
      return sonner.error(message, ...rest);
    }) as SonnerToast["error"],
    warning: ((message, ...rest) => {
      log_toast("warn", message, rest[0]);
      return sonner.warning(message, ...rest);
    }) as SonnerToast["warning"],
  },
);
