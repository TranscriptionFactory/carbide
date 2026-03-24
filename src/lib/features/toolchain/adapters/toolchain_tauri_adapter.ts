import { tauri_invoke } from "$lib/shared/adapters/tauri_invoke";
import { listen } from "@tauri-apps/api/event";
import type { ToolchainPort } from "$lib/features/toolchain/ports";
import type { ToolInfo, ToolchainEvent } from "$lib/features/toolchain/types";

export function create_toolchain_tauri_adapter(): ToolchainPort {
  return {
    list_tools: () => tauri_invoke<ToolInfo[]>("toolchain_list_tools"),

    install: (tool_id) =>
      tauri_invoke("toolchain_install", { toolId: tool_id }),

    uninstall: (tool_id) =>
      tauri_invoke("toolchain_uninstall", { toolId: tool_id }),

    resolve: (tool_id) =>
      tauri_invoke<string>("toolchain_resolve", { toolId: tool_id }),

    subscribe_events(callback: (event: ToolchainEvent) => void) {
      let unlisten_fn: (() => void) | null = null;
      let is_disposed = false;

      void listen<ToolchainEvent>("toolchain_event", (event) => {
        if (is_disposed) return;
        callback(event.payload);
      }).then((fn_ref) => {
        if (is_disposed) {
          try {
            fn_ref();
          } catch {
            /* already disposed */
          }
          return;
        }
        unlisten_fn = fn_ref;
      });

      return () => {
        is_disposed = true;
        if (unlisten_fn) {
          const fn_ref = unlisten_fn;
          unlisten_fn = null;
          try {
            fn_ref();
          } catch {
            /* ignore */
          }
        }
      };
    },
  };
}
