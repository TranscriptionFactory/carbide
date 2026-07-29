import { toast } from "svelte-sonner";
import type { OpStore } from "$lib/app";
import { create_logger } from "$lib/shared/utils/logger";

const log = create_logger("op_toast_reactor");

type ToastCommand =
  | { kind: "success"; message: string }
  | { kind: "error"; message: string; log_label: string; error: string };

export function resolve_op_toast_commands(input: {
  key: string;
  previous_status: string;
  current_status: string;
  error: string | null;
  message: string | null;
}): ToastCommand[] {
  const { key, previous_status, current_status, error, message } = input;
  if (current_status === previous_status) {
    return [];
  }

  if (key === "clipboard.write") {
    if (current_status === "success") {
      return [{ kind: "success", message: "Copied to clipboard" }];
    }
    if (current_status === "error") {
      return [
        {
          kind: "error",
          message: "Failed to copy to clipboard",
          log_label: "Clipboard write failed",
          error: error ?? "unknown error",
        },
      ];
    }
  }

  if (key === "links.repair") {
    if (current_status === "success") {
      return [
        {
          kind: "success",
          message: message ?? "Link repair complete",
        },
      ];
    }
    if (current_status === "error") {
      return [
        {
          kind: "error",
          message: "Some links could not be repaired",
          log_label: "Link repair failed",
          error: error ?? "unknown error",
        },
      ];
    }
  }

  if (key === "filetree.import_external") {
    if (current_status === "success") {
      return [
        {
          kind: "success",
          message: message ?? "Imported dropped files",
        },
      ];
    }
    if (current_status === "error") {
      return [
        {
          kind: "error",
          message: "Could not import dropped files",
          log_label: "External file import failed",
          error: error ?? "unknown error",
        },
      ];
    }
  }

  return [];
}

const WATCHED_OP_KEYS = [
  "clipboard.write",
  "links.repair",
  "filetree.import_external",
];

export function create_op_toast_reactor(op_store: OpStore): () => void {
  const last_status = new Map(
    WATCHED_OP_KEYS.map((key) => [key, op_store.get(key).status]),
  );

  const apply_commands = (commands: ToastCommand[]) => {
    for (const command of commands) {
      if (command.kind === "success") {
        toast.success(command.message);
        continue;
      }

      log.error(command.log_label, { error: command.error });
      toast.error(command.message);
    }
  };

  return $effect.root(() => {
    $effect(() => {
      for (const key of WATCHED_OP_KEYS) {
        const op = op_store.get(key);
        const commands = resolve_op_toast_commands({
          key,
          previous_status: last_status.get(key) ?? "idle",
          current_status: op.status,
          error: op.error,
          message: op.message,
        });
        last_status.set(key, op.status);
        apply_commands(commands);
      }
    });
  });
}
