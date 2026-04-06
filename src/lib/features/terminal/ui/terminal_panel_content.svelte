<script lang="ts">
  import { Plus, X } from "@lucide/svelte";
  import { ACTION_IDS } from "$lib/app";
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import { Button } from "$lib/components/ui/button";
  import {
    DEFAULT_TERMINAL_SESSION_ID,
    resolve_terminal_session_target,
  } from "$lib/features/terminal";
  import TerminalSessionView from "$lib/features/terminal/ui/terminal_session_view.svelte";
  import type { TerminalSessionRequest } from "$lib/features/terminal/application/terminal_service";

  const { stores, action_registry } = use_app_context();

  function get_shell(): string {
    return stores.ui.editor_settings.terminal_shell_path || "/bin/zsh";
  }

  function build_session_request(): TerminalSessionRequest {
    const target = resolve_terminal_session_target({
      follow_active_vault:
        stores.ui.editor_settings.terminal_follow_active_vault,
      followed_cwd: stores.vault.vault?.path ?? undefined,
      fixed_cwd: stores.vault.vault?.path ?? undefined,
    });

    return {
      cols: 80,
      rows: 24,
      shell_path: get_shell(),
      cwd: target.cwd,
      cwd_policy: target.cwd_policy,
      respawn_policy: target.respawn_policy,
    };
  }

  const session_ids = $derived.by(() =>
    stores.terminal.session_ids.length > 0
      ? stores.terminal.session_ids
      : [DEFAULT_TERMINAL_SESSION_ID],
  );

  const active_session_id = $derived.by(
    () =>
      stores.terminal.active_session_id ??
      stores.terminal.session_ids[0] ??
      DEFAULT_TERMINAL_SESSION_ID,
  );

  function get_session_label(session_id: string, index: number): string {
    const session = stores.terminal.get_session(session_id);
    const shell_name = session?.shell_path?.split("/").pop();

    return shell_name
      ? `${shell_name} ${String(index + 1)}`
      : `Session ${String(index + 1)}`;
  }

  function get_status(session_id: string): "idle" | "running" | "exited" {
    return stores.terminal.get_session(session_id)?.status ?? "idle";
  }

  async function create_session() {
    await action_registry.execute(
      ACTION_IDS.terminal_new_session,
      build_session_request(),
    );
  }

  async function activate_session(session_id: string) {
    await action_registry.execute(
      ACTION_IDS.terminal_activate_session,
      session_id,
    );
  }

  async function close_session(event: MouseEvent, session_id: string) {
    event.stopPropagation();
    await action_registry.execute(
      ACTION_IDS.terminal_close_session,
      session_id,
    );
  }
</script>

<div class="TerminalPanel">
  <div class="TerminalPanel__header">
    <span class="TerminalPanel__title">Terminal</span>
    <div class="TerminalPanel__headerActions">
      <Button
        variant="ghost"
        size="icon"
        class="TerminalPanel__iconButton"
        aria-label="New terminal session"
        onclick={() => void create_session()}
      >
        <Plus class="TerminalPanel__icon" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        class="TerminalPanel__iconButton"
        aria-label="Close terminal"
        onclick={() => void action_registry.execute(ACTION_IDS.terminal_close)}
      >
        <X class="TerminalPanel__icon" />
      </Button>
    </div>
  </div>

  <div
    class="TerminalPanel__tabs"
    role="tablist"
    aria-label="Terminal sessions"
  >
    {#each session_ids as session_id, index (session_id)}
      <div
        class:TerminalPanel__tab--active={session_id === active_session_id}
        class="TerminalPanel__tab"
      >
        <button
          type="button"
          role="tab"
          class="TerminalPanel__tabButton"
          aria-selected={session_id === active_session_id}
          onclick={() => void activate_session(session_id)}
        >
          <span
            class="TerminalPanel__status"
            data-status={get_status(session_id)}
            aria-hidden="true"
          ></span>
          <span class="TerminalPanel__tabLabel">
            {get_session_label(session_id, index)}
          </span>
        </button>
        {#if stores.terminal.session_ids.length > 0}
          <span class="TerminalPanel__tabClose">
            <Button
              variant="ghost"
              size="icon"
              class="TerminalPanel__tabCloseButton"
              aria-label={`Close ${get_session_label(session_id, index)}`}
              onclick={(event) => void close_session(event, session_id)}
            >
              <X class="TerminalPanel__tabCloseIcon" />
            </Button>
          </span>
        {/if}
      </div>
    {/each}
  </div>

  <div class="TerminalPanel__sessions">
    {#each session_ids as session_id (session_id)}
      <TerminalSessionView
        {session_id}
        active={session_id === active_session_id}
      />
    {/each}
  </div>
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
    min-height: var(--size-touch-md, 32px);
    padding-inline: var(--space-1);
    gap: var(--space-1);
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

  .TerminalPanel__headerActions {
    display: flex;
    align-items: center;
    gap: var(--space-1, 4px);
  }

  :global(.TerminalPanel__iconButton) {
    width: var(--size-touch-sm, 24px);
    height: var(--size-touch-sm, 24px);
    color: var(--muted-foreground);
  }

  :global(.TerminalPanel__iconButton:hover) {
    color: var(--foreground);
  }

  :global(.TerminalPanel__icon) {
    width: var(--size-icon-xs, 14px);
    height: var(--size-icon-xs, 14px);
  }

  .TerminalPanel__tabs {
    display: flex;
    align-items: center;
    gap: var(--space-1, 4px);
    min-height: 32px;
    padding: var(--space-1);
    overflow-x: auto;
    border-block-end: 1px solid var(--border);
    background: color-mix(in srgb, var(--sidebar) 88%, black);
  }

  .TerminalPanel__tab {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    min-width: 0;
    max-width: 220px;
    padding-inline: var(--space-1);
    height: 26px;
    border-radius: var(--radius-sm);
    border: 1px solid transparent;
    background: transparent;
    color: var(--muted-foreground);
    transition:
      background-color 120ms ease,
      color 120ms ease,
      border-color 120ms ease;
  }

  .TerminalPanel__tab:hover,
  .TerminalPanel__tab--active {
    background: var(--accent);
    color: var(--foreground);
  }

  .TerminalPanel__tab--active {
    border-color: color-mix(in srgb, var(--primary) 35%, transparent);
  }

  .TerminalPanel__tabButton {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    min-width: 0;
    flex: 1;
    height: 100%;
    background: transparent;
    color: inherit;
    cursor: pointer;
    border: 0;
    padding: 0;
  }

  .TerminalPanel__status {
    flex-shrink: 0;
    width: 8px;
    height: 8px;
    border-radius: 9999px;
    background: var(--muted);
  }

  .TerminalPanel__status[data-status="running"] {
    background: var(--primary);
  }

  .TerminalPanel__status[data-status="exited"] {
    background: var(--destructive);
  }

  .TerminalPanel__tabLabel {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--text-sm);
  }

  .TerminalPanel__tabClose {
    display: inline-flex;
    align-items: center;
    margin-inline-start: auto;
  }

  :global(.TerminalPanel__tabCloseButton) {
    width: 16px;
    height: 16px;
    color: inherit;
  }

  :global(.TerminalPanel__tabCloseIcon) {
    width: 10px;
    height: 10px;
  }

  .TerminalPanel__sessions {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    padding: var(--space-1, 4px) var(--space-2, 8px);
  }
</style>
