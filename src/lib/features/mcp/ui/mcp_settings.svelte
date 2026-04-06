<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import * as Switch from "$lib/components/ui/switch/index.js";
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import type { McpSetupStatus } from "$lib/features/mcp";
  import CheckCircle from "@lucide/svelte/icons/check-circle";
  import XCircle from "@lucide/svelte/icons/x-circle";
  import RefreshCw from "@lucide/svelte/icons/refresh-cw";

  type Props = {
    mcp_enabled: boolean;
    on_toggle_mcp: (enabled: boolean) => void;
  };

  let { mcp_enabled, on_toggle_mcp }: Props = $props();

  const { stores, services } = use_app_context();

  const mcp_status = $derived(stores.mcp.status);
  const setup_status = $derived(stores.mcp.setup_status);

  let setup_loading = $state<string | null>(null);
  let setup_message = $state<string | null>(null);
  let regen_loading = $state(false);

  $effect(() => {
    void services.mcp.refresh_setup_status();
  });

  async function setup_claude_desktop() {
    setup_loading = "desktop";
    setup_message = null;
    try {
      const result = await services.mcp.setup_claude_desktop();
      setup_message = result.message;
    } catch (e) {
      setup_message = `Failed: ${e instanceof Error ? e.message : String(e)}`;
    } finally {
      setup_loading = null;
    }
  }

  async function setup_claude_code() {
    const vault = stores.vault.vault;
    if (!vault) {
      setup_message = "No active vault. Open a vault first.";
      return;
    }
    setup_loading = "code";
    setup_message = null;
    try {
      const result = await services.mcp.setup_claude_code(vault.id);
      setup_message = result.message;
    } catch (e) {
      setup_message = `Failed: ${e instanceof Error ? e.message : String(e)}`;
    } finally {
      setup_loading = null;
    }
  }

  async function regenerate_token() {
    regen_loading = true;
    setup_message = null;
    try {
      await services.mcp.regenerate_token();
      await services.mcp.refresh_setup_status();
      setup_message =
        "Token regenerated. Re-configure clients to use the new token.";
    } catch (e) {
      setup_message = `Failed: ${e instanceof Error ? e.message : String(e)}`;
    } finally {
      regen_loading = false;
    }
  }
</script>

<div class="McpSettings">
  <div class="McpSettings__row">
    <div class="McpSettings__label-group">
      <span class="McpSettings__label">Enable MCP Server</span>
      <span class="McpSettings__description"
        >Start the MCP server when a vault is opened, allowing AI assistants to
        access your notes</span
      >
    </div>
    <Switch.Root
      checked={mcp_enabled}
      onCheckedChange={(v: boolean) => on_toggle_mcp(v)}
    />
  </div>

  <div class="McpSettings__row">
    <div class="McpSettings__label-group">
      <span class="McpSettings__label">Server Status</span>
      <span class="McpSettings__description">
        {#if mcp_status === "running"}
          MCP server is running on port {setup_status?.httpPort ?? "3457"}
        {:else}
          MCP server is not running
        {/if}
      </span>
    </div>
    <span
      class="McpSettings__status-badge"
      class:McpSettings__status-badge--running={mcp_status === "running"}
    >
      {mcp_status}
    </span>
  </div>

  <div class="McpSettings__divider"></div>
  <h3 class="McpSettings__subheader">Client Configuration</h3>

  <div class="McpSettings__row">
    <div class="McpSettings__label-group">
      <span class="McpSettings__label">
        {#if setup_status?.claudeDesktopConfigured}
          <CheckCircle size={14} class="McpSettings__icon--ok" />
        {:else}
          <XCircle size={14} class="McpSettings__icon--missing" />
        {/if}
        Claude Desktop
      </span>
      <span class="McpSettings__description">
        Write Carbide MCP entry to claude_desktop_config.json
      </span>
    </div>
    <Button
      variant="outline"
      size="sm"
      disabled={setup_loading === "desktop"}
      onclick={setup_claude_desktop}
    >
      {setup_loading === "desktop" ? "Configuring..." : "Configure"}
    </Button>
  </div>

  <div class="McpSettings__row">
    <div class="McpSettings__label-group">
      <span class="McpSettings__label">
        {#if setup_status?.claudeCodeConfigured}
          <CheckCircle size={14} class="McpSettings__icon--ok" />
        {:else}
          <XCircle size={14} class="McpSettings__icon--missing" />
        {/if}
        Claude Code
      </span>
      <span class="McpSettings__description">
        Write .mcp.json to the active vault directory
      </span>
    </div>
    <Button
      variant="outline"
      size="sm"
      disabled={setup_loading === "code"}
      onclick={setup_claude_code}
    >
      {setup_loading === "code" ? "Configuring..." : "Configure"}
    </Button>
  </div>

  <div class="McpSettings__divider"></div>
  <h3 class="McpSettings__subheader">Authentication</h3>

  <div class="McpSettings__row">
    <div class="McpSettings__label-group">
      <span class="McpSettings__label">Bearer Token</span>
      <span class="McpSettings__description">
        {#if setup_status?.tokenExists}
          Token exists at ~/.carbide/mcp-token
        {:else}
          No token found. Configure a client to auto-generate one.
        {/if}
      </span>
    </div>
    <Button
      variant="outline"
      size="sm"
      disabled={regen_loading}
      onclick={regenerate_token}
    >
      <RefreshCw size={14} class={regen_loading ? "animate-spin" : ""} />
      Regenerate
    </Button>
  </div>

  {#if setup_message}
    <p class="McpSettings__message">{setup_message}</p>
  {/if}
</div>

<style>
  .McpSettings {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .McpSettings__row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    min-height: 2.5rem;
  }

  .McpSettings__label-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-0-5);
    flex: 1;
    min-width: 0;
  }

  .McpSettings__label {
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--foreground);
    display: flex;
    align-items: center;
    gap: var(--space-1-5);
  }

  .McpSettings__description {
    font-size: var(--text-xs);
    color: var(--muted-foreground);
    line-height: 1.4;
  }

  .McpSettings__subheader {
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--foreground);
    margin: 0;
  }

  .McpSettings__divider {
    height: 1px;
    background-color: var(--border);
    margin: var(--space-1) 0;
  }

  .McpSettings__status-badge {
    font-size: var(--text-xs);
    padding: var(--space-0-5) var(--space-2);
    border-radius: var(--radius-full);
    background-color: var(--muted);
    color: var(--muted-foreground);
    text-transform: capitalize;
  }

  .McpSettings__status-badge--running {
    background-color: var(--interactive-bg);
    color: var(--interactive-text-on-bg);
  }

  .McpSettings__message {
    font-size: var(--text-xs);
    color: var(--muted-foreground);
    padding: var(--space-2);
    background-color: var(--muted);
    border-radius: var(--radius-sm);
    margin: 0;
  }

  :global(.McpSettings__icon--ok) {
    color: var(--success, hsl(142 71% 45%));
  }

  :global(.McpSettings__icon--missing) {
    color: var(--muted-foreground);
  }
</style>
