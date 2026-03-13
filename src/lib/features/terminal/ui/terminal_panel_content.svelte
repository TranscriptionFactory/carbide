<script lang="ts">
  import "@xterm/xterm/css/xterm.css";
  import { Terminal } from "@xterm/xterm";
  import { FitAddon } from "@xterm/addon-fit";
  import { onMount, onDestroy } from "svelte";
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import { ACTION_IDS } from "$lib/app";
  import { X } from "@lucide/svelte";
  import { Button } from "$lib/components/ui/button";
  import { create_logger } from "$lib/shared/utils/logger";
  import type { TerminalSessionRequest } from "$lib/features/terminal/application/terminal_service";

  const log = create_logger("terminal_panel");
  const { stores, action_registry, terminal_runtime } = use_app_context();

  let container_el: HTMLDivElement | undefined = $state();
  let terminal: Terminal | undefined;
  let fit_addon: FitAddon | undefined;
  let resize_observer: ResizeObserver | undefined;
  let destroyed = false;
  let session_syncing = $state(false);
  let attached_session_id = $state<string | null>(null);
  let attached_view_id = $state<string | null>(null);
  let spawned_shell = $state("");
  let spawned_vault_path = $state<string | undefined>(undefined);

  function get_shell(): string {
    return stores.ui.editor_settings.terminal_shell_path || "/bin/zsh";
  }

  function build_session_request(): TerminalSessionRequest {
    const follow_active_vault =
      stores.ui.editor_settings.terminal_follow_active_vault;

    return {
      cols: terminal?.cols ?? 80,
      rows: terminal?.rows ?? 24,
      shell_path: get_shell(),
      cwd: stores.vault.vault?.path ?? undefined,
      cwd_policy: follow_active_vault ? "follow_active_vault" : "fixed",
      respawn_policy: follow_active_vault ? "on_context_change" : "manual",
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
    return {
      background: resolve_css_color("--sidebar", "#1e1e2e"),
      foreground: resolve_css_color("--foreground", "#cdd6f4"),
      cursor: resolve_css_color("--primary", "#f5e0dc"),
      selectionBackground: resolve_css_color("--accent", "#45475a"),
    };
  }

  function detach_terminal_view() {
    if (!attached_session_id || !attached_view_id) {
      attached_session_id = null;
      attached_view_id = null;
      return;
    }

    terminal_runtime.detach_view(attached_session_id, attached_view_id);
    attached_session_id = null;
    attached_view_id = null;
  }

  async function ensure_terminal_session() {
    if (!terminal || session_syncing) return;

    session_syncing = true;
    try {
      const request = build_session_request();
      const { session_id, view_id } =
        await terminal_runtime.ensure_active_session(request, {
          on_output: (data) => {
            if (destroyed) return;
            terminal?.write(data);
          },
          on_exit: (event) => {
            if (destroyed) return;
            log.info("PTY exited", { exitCode: event.exit_code });
            terminal?.write(
              `\r\n[Process exited with code ${String(event.exit_code)}]\r\n`,
            );
          },
        });

      if (destroyed) {
        if (view_id) {
          terminal_runtime.detach_view(session_id, view_id);
        }
        return;
      }

      attached_session_id = session_id;
      attached_view_id = view_id;
      spawned_shell = request.shell_path;
      spawned_vault_path = request.cwd;
    } catch (error) {
      log.error("Failed to start terminal session", { error: String(error) });
      terminal?.write(`\r\nFailed to start terminal: ${String(error)}\r\n`);
    } finally {
      session_syncing = false;
    }
  }

  async function respawn_terminal() {
    if (!terminal || !attached_session_id || session_syncing) return;

    session_syncing = true;
    try {
      const request = build_session_request();
      await terminal_runtime.respawn_active_session(request);
      if (destroyed) return;
      spawned_shell = request.shell_path;
      spawned_vault_path = request.cwd;
    } catch (error) {
      log.error("Failed to respawn terminal session", { error: String(error) });
      terminal?.write(`\r\nFailed to restart terminal: ${String(error)}\r\n`);
    } finally {
      session_syncing = false;
    }
  }

  function init_terminal() {
    if (!container_el) return;

    terminal = new Terminal({
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, monospace",
      fontSize: stores.ui.editor_settings.terminal_font_size_px,
      lineHeight: 1.3,
      cursorBlink: stores.ui.editor_settings.terminal_cursor_blink,
      scrollback: stores.ui.editor_settings.terminal_scrollback,
      theme: build_xterm_theme(),
    });

    fit_addon = new FitAddon();
    terminal.loadAddon(fit_addon);
    terminal.open(container_el);
    fit_addon.fit();
    terminal.focus();

    terminal.onData((data: string) => {
      terminal_runtime.write_active_session(data);
    });

    terminal.textarea?.addEventListener("focus", () => {
      stores.terminal.set_focused(true);
    });
    terminal.textarea?.addEventListener("blur", () => {
      stores.terminal.set_focused(false);
    });

    void ensure_terminal_session();

    resize_observer = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        if (!fit_addon || !terminal || destroyed) return;
        try {
          fit_addon.fit();
          terminal_runtime.resize_active_session(terminal.cols, terminal.rows);
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
    detach_terminal_view();
    stores.terminal.set_focused(false);
    spawned_shell = "";
    spawned_vault_path = undefined;
    terminal?.dispose();
    terminal = undefined;
    fit_addon = undefined;
  }

  $effect(() => {
    if (!terminal) return;
    terminal.options.fontSize = stores.ui.editor_settings.terminal_font_size_px;
    terminal.options.scrollback = stores.ui.editor_settings.terminal_scrollback;
    terminal.options.cursorBlink =
      stores.ui.editor_settings.terminal_cursor_blink;
    terminal.options.theme = build_xterm_theme();
    requestAnimationFrame(() => {
      fit_addon?.fit();
    });
  });

  $effect(() => {
    const follow_active_vault =
      stores.ui.editor_settings.terminal_follow_active_vault;
    const vault_path = stores.vault.vault?.path ?? undefined;
    if (
      !follow_active_vault ||
      !terminal ||
      !attached_session_id ||
      session_syncing
    ) {
      return;
    }
    if (spawned_vault_path === vault_path) return;
    void respawn_terminal();
  });

  $effect(() => {
    const shell = get_shell();
    if (!terminal || !attached_session_id || session_syncing) return;
    if (spawned_shell === shell) return;
    void respawn_terminal();
  });

  onMount(() => {
    init_terminal();
  });

  onDestroy(() => {
    cleanup();
  });
</script>

<div class="TerminalPanel">
  <div class="TerminalPanel__header">
    <span class="TerminalPanel__title">Terminal</span>
    <Button
      variant="ghost"
      size="icon"
      class="TerminalPanel__close"
      onclick={() => void action_registry.execute(ACTION_IDS.terminal_close)}
    >
      <X class="TerminalPanel__close-icon" />
    </Button>
  </div>
  <div class="TerminalPanel__body" bind:this={container_el}></div>
</div>

<style>
  .TerminalPanel {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--sidebar);
    border-block-start: 1px solid var(--border);
  }

  .TerminalPanel__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: var(--size-touch-md, 32px);
    padding-inline: var(--space-3);
    flex-shrink: 0;
    background: var(--sidebar);
    border-block-end: 1px solid var(--border);
  }

  .TerminalPanel__title {
    font-size: var(--text-xs);
    font-weight: 600;
    color: var(--muted-foreground);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  :global(.TerminalPanel__close) {
    width: var(--size-touch-sm, 24px);
    height: var(--size-touch-sm, 24px);
    color: var(--muted-foreground);
  }

  :global(.TerminalPanel__close:hover) {
    color: var(--foreground);
  }

  :global(.TerminalPanel__close-icon) {
    width: var(--size-icon-xs, 14px);
    height: var(--size-icon-xs, 14px);
  }

  .TerminalPanel__body {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    padding: var(--space-1, 4px) var(--space-2, 8px);
  }
</style>
