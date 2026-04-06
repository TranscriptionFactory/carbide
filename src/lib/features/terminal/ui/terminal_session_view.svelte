<script lang="ts">
  import "@xterm/xterm/css/xterm.css";
  import { FitAddon } from "@xterm/addon-fit";
  import { Terminal } from "@xterm/xterm";
  import { RotateCcw } from "@lucide/svelte";
  import { onDestroy, onMount } from "svelte";
  import { ACTION_IDS } from "$lib/app";
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import { Button } from "$lib/components/ui/button";
  import { resolve_terminal_session_target } from "$lib/features/terminal";
  import { create_logger } from "$lib/shared/utils/logger";
  import type { TerminalSessionRequest } from "$lib/features/terminal/application/terminal_service";

  type Props = {
    session_id: string;
    active: boolean;
  };

  const log = create_logger("terminal_session_view");
  const { stores, action_registry, terminal_runtime } = use_app_context();

  let { session_id, active }: Props = $props();

  let container_el = $state<HTMLDivElement | undefined>(undefined);
  let terminal = $state<Terminal | undefined>(undefined);
  let fit_addon = $state<FitAddon | undefined>(undefined);
  let resize_observer = $state<ResizeObserver | undefined>(undefined);
  let destroyed = false;
  let session_syncing = $state(false);
  let on_focus: (() => void) | undefined;
  let on_blur: (() => void) | undefined;
  let attached_view_id = $state<string | null>(null);

  function get_shell(): string {
    return stores.ui.editor_settings.terminal_shell_path || "/bin/zsh";
  }

  function build_session_request(): TerminalSessionRequest {
    const session = stores.terminal.get_session(session_id);
    const target = resolve_terminal_session_target({
      follow_active_vault:
        stores.ui.editor_settings.terminal_follow_active_vault,
      followed_cwd: stores.vault.vault?.path ?? undefined,
      fixed_cwd: session?.cwd ?? stores.vault.vault?.path ?? undefined,
    });

    return {
      cols: terminal?.cols ?? 80,
      rows: terminal?.rows ?? 24,
      shell_path: get_shell(),
      cwd: target.cwd,
      cwd_policy: target.cwd_policy,
      respawn_policy: target.respawn_policy,
    };
  }

  function resolve_css_color(property: string, fallback: string): string {
    if (typeof document === "undefined") return fallback;

    const value = getComputedStyle(document.documentElement)
      .getPropertyValue(property)
      .trim();
    if (!value) return fallback;

    const probe = document.createElement("div");
    probe.style.color = value;
    document.body.appendChild(probe);
    const resolved = getComputedStyle(probe).color;
    probe.remove();
    return resolved || fallback;
  }

  function build_xterm_theme() {
    const is_dark =
      document.documentElement.getAttribute("data-color-scheme") === "dark";
    return {
      background:
        stores.ui.editor_settings.terminal_background_color ||
        resolve_css_color("--sidebar", is_dark ? "#1e1e2e" : "#f5f5f5"),
      foreground:
        stores.ui.editor_settings.terminal_foreground_color ||
        resolve_css_color("--foreground", is_dark ? "#cdd6f4" : "#1e1e2e"),
      cursor: resolve_css_color("--primary", is_dark ? "#f5e0dc" : "#333333"),
      cursorAccent: resolve_css_color(
        "--background",
        is_dark ? "#1e1e2e" : "#f5f5f5",
      ),
      selectionBackground: resolve_css_color(
        "--accent",
        is_dark ? "#45475a" : "#d0d0d0",
      ),
      selectionForeground: resolve_css_color(
        "--accent-foreground",
        is_dark ? "#cdd6f4" : "#1e1e2e",
      ),
      black: is_dark ? "#45475a" : "#1e1e2e",
      red: is_dark ? "#f38ba8" : "#d32f2f",
      green: is_dark ? "#a6e3a1" : "#388e3c",
      yellow: is_dark ? "#f9e2af" : "#f57f17",
      blue: is_dark ? "#89b4fa" : "#1976d2",
      magenta: is_dark ? "#f5c2e7" : "#7b1fa2",
      cyan: is_dark ? "#94e2d5" : "#0097a7",
      white: is_dark ? "#bac2de" : "#f5f5f5",
      brightBlack: is_dark ? "#585b70" : "#616161",
      brightRed: is_dark ? "#f38ba8" : "#f44336",
      brightGreen: is_dark ? "#a6e3a1" : "#4caf50",
      brightYellow: is_dark ? "#f9e2af" : "#ffeb3b",
      brightBlue: is_dark ? "#89b4fa" : "#2196f3",
      brightMagenta: is_dark ? "#f5c2e7" : "#e040fb",
      brightCyan: is_dark ? "#94e2d5" : "#00bcd4",
      brightWhite: is_dark ? "#a6adc8" : "#ffffff",
    };
  }

  function detach_terminal_view() {
    if (!attached_view_id) {
      attached_view_id = null;
      return;
    }

    terminal_runtime.detach_view(session_id, attached_view_id);
    attached_view_id = null;
  }

  async function ensure_terminal_session() {
    if (!terminal || session_syncing) return;

    session_syncing = true;
    try {
      const request = build_session_request();
      const { view_id } = await terminal_runtime.ensure_session(
        session_id,
        request,
        {
          on_output: (data) => {
            if (destroyed) return;
            terminal?.write(data);
          },
          on_exit: (event) => {
            if (destroyed) return;
            log.info("PTY exited", {
              exit_code: event.exit_code,
              session_id,
            });
            terminal?.write(
              `\r\n[Process exited with code ${String(event.exit_code)}]\r\n`,
            );
          },
        },
        {
          activate: active,
        },
      );

      if (destroyed) {
        if (view_id) {
          terminal_runtime.detach_view(session_id, view_id);
        }
        return;
      }

      attached_view_id = view_id;
    } catch (error) {
      log.error("Failed to start terminal session", {
        error: String(error),
        session_id,
      });
      terminal?.write(`\r\nFailed to start terminal: ${String(error)}\r\n`);
    } finally {
      session_syncing = false;
    }
  }

  async function respawn_terminal() {
    if (!terminal || session_syncing) return;

    session_syncing = true;
    try {
      const request = build_session_request();
      await action_registry.execute(
        ACTION_IDS.terminal_respawn_session,
        session_id,
        request,
      );
      if (destroyed) return;

      requestAnimationFrame(() => {
        if (!fit_addon || !terminal || destroyed) return;
        try {
          fit_addon.fit();
          terminal_runtime.resize_session(
            session_id,
            terminal.cols,
            terminal.rows,
          );
        } catch {
          return;
        }
      });
    } catch (error) {
      log.error("Failed to respawn terminal session", {
        error: String(error),
        session_id,
      });
      terminal?.write(`\r\nFailed to restart terminal: ${String(error)}\r\n`);
    } finally {
      session_syncing = false;
    }
  }

  function init_terminal() {
    if (!container_el) return;

    terminal = new Terminal({
      fontFamily:
        stores.ui.editor_settings.terminal_font_family ||
        "ui-monospace, SFMono-Regular, Menlo, Monaco, monospace",
      fontSize: stores.ui.editor_settings.terminal_font_size_px,
      fontWeight: stores.ui.editor_settings.terminal_font_weight,
      fontWeightBold: stores.ui.editor_settings.terminal_font_weight_bold,
      lineHeight: stores.ui.editor_settings.terminal_line_height,
      cursorBlink: stores.ui.editor_settings.terminal_cursor_blink,
      cursorStyle: stores.ui.editor_settings.terminal_cursor_style,
      scrollback: stores.ui.editor_settings.terminal_scrollback,
      theme: build_xterm_theme(),
    });

    fit_addon = new FitAddon();
    terminal.loadAddon(fit_addon);
    terminal.open(container_el);

    if (active) {
      requestAnimationFrame(() => {
        if (!fit_addon || !terminal || destroyed) return;
        try {
          fit_addon.fit();
          terminal.focus();
          terminal_runtime.resize_session(
            session_id,
            terminal.cols,
            terminal.rows,
          );
        } catch {
          return;
        }
      });
    }

    terminal.onData((data: string) => {
      // Only send data if this session is the active one to prevent
      // background sessions from interfering or leaking input
      if (!active) return;
      terminal_runtime.write_session(session_id, data);
    });

    const textarea = terminal.textarea;
    if (textarea) {
      on_focus = () => {
        if (!active) return;
        stores.terminal.set_focused(true);
      };
      on_blur = () => {
        if (!active) return;
        stores.terminal.set_focused(false);
      };
      textarea.addEventListener("focus", on_focus);
      textarea.addEventListener("blur", on_blur);
    }

    void ensure_terminal_session();

    resize_observer = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        if (!fit_addon || !terminal || destroyed || !active) return;
        try {
          fit_addon.fit();
          terminal_runtime.resize_session(
            session_id,
            terminal.cols,
            terminal.rows,
          );
        } catch {
          return;
        }
      });
    });
    resize_observer.observe(container_el);
  }

  function cleanup() {
    destroyed = true;
    resize_observer?.disconnect();
    resize_observer = undefined;

    const textarea = terminal?.textarea;
    if (textarea) {
      if (on_focus) textarea.removeEventListener("focus", on_focus);
      if (on_blur) textarea.removeEventListener("blur", on_blur);
    }
    on_focus = undefined;
    on_blur = undefined;

    detach_terminal_view();

    if (active) {
      stores.terminal.set_focused(false);
    }

    terminal?.dispose();
    terminal = undefined;
    fit_addon = undefined;
  }

  $effect(() => {
    if (!terminal) return;
    terminal.options.fontFamily =
      stores.ui.editor_settings.terminal_font_family ||
      "ui-monospace, SFMono-Regular, Menlo, Monaco, monospace";
    terminal.options.fontSize = stores.ui.editor_settings.terminal_font_size_px;
    terminal.options.fontWeight =
      stores.ui.editor_settings.terminal_font_weight;
    terminal.options.fontWeightBold =
      stores.ui.editor_settings.terminal_font_weight_bold;
    terminal.options.lineHeight =
      stores.ui.editor_settings.terminal_line_height;
    terminal.options.cursorBlink =
      stores.ui.editor_settings.terminal_cursor_blink;
    terminal.options.cursorStyle =
      stores.ui.editor_settings.terminal_cursor_style;
    terminal.options.scrollback = stores.ui.editor_settings.terminal_scrollback;
    void stores.ui.active_theme.color_scheme;
    terminal.options.theme = build_xterm_theme();

    if (!active) return;

    requestAnimationFrame(() => {
      if (!fit_addon || !terminal || destroyed) return;
      try {
        fit_addon.fit();
        terminal_runtime.resize_session(
          session_id,
          terminal.cols,
          terminal.rows,
        );
      } catch {
        return;
      }
    });
  });

  $effect(() => {
    // Only perform activation logic when 'active' becomes true
    if (!terminal || !active) return;

    requestAnimationFrame(() => {
      if (!fit_addon || !terminal || destroyed) return;
      try {
        fit_addon.fit();
        terminal.focus();
        terminal_runtime.resize_session(
          session_id,
          terminal.cols,
          terminal.rows,
        );
      } catch {
        return;
      }
    });
  });

  onMount(() => {
    init_terminal();
  });

  onDestroy(() => {
    cleanup();
  });
</script>

<div
  class:TerminalSessionView--active={active}
  class="TerminalSessionView"
  aria-hidden={!active}
>
  {#if active}
    <div class="TerminalSessionView__toolbar">
      <Button
        variant="ghost"
        size="sm"
        class="TerminalSessionView__restartButton"
        onclick={() => void respawn_terminal()}
      >
        <RotateCcw class="TerminalSessionView__restartIcon" />
        <span>Restart</span>
      </Button>
    </div>
  {/if}
  <div class="TerminalSessionView__surface" bind:this={container_el}></div>
</div>

<style>
  .TerminalSessionView {
    display: none;
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 0;
  }

  .TerminalSessionView--active {
    display: block;
  }

  .TerminalSessionView__toolbar {
    position: absolute;
    inset-block-start: var(--space-2, 8px);
    inset-inline-end: var(--space-2, 8px);
    z-index: 1;
  }

  :global(.TerminalSessionView__restartButton) {
    gap: var(--space-1, 4px);
    height: 24px;
    padding-inline: var(--space-2, 8px);
    background: color-mix(in srgb, var(--sidebar) 88%, black);
    border: 1px solid var(--border);
    color: var(--muted-foreground);
  }

  :global(.TerminalSessionView__restartButton:hover) {
    color: var(--foreground);
  }

  :global(.TerminalSessionView__restartIcon) {
    width: 12px;
    height: 12px;
  }

  .TerminalSessionView__surface {
    width: 100%;
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }
</style>
