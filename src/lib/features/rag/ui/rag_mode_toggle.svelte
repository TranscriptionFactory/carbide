<script lang="ts">
  import type { RagSessionMode } from "$lib/features/rag/domain/rag_types";
  import type { AgentPermissionMode } from "$lib/features/rag/types/agent_events";

  type Props = {
    mode: RagSessionMode;
    permission_mode: AgentPermissionMode;
    agent_supported: boolean;
    on_set_mode: (mode: RagSessionMode) => void;
    on_set_permission_mode: (mode: AgentPermissionMode) => void;
  };

  let {
    mode,
    permission_mode,
    agent_supported,
    on_set_mode,
    on_set_permission_mode,
  }: Props = $props();

  const AGENT_UNSUPPORTED_HINT = "Agent mode requires the Claude Code provider";

  const MODES: Array<{ value: RagSessionMode; label: string }> = [
    { value: "ask", label: "Ask" },
    { value: "agent", label: "Agent" },
  ];

  const PERMISSIONS: Array<{
    value: AgentPermissionMode;
    label: string;
    hint: string;
  }> = [
    { value: "safe", label: "Safe", hint: "Note tools only — no shell or file edits" },
    { value: "power", label: "Power", hint: "Agent can edit files in your vault" },
  ];
</script>

<div class="flex items-center justify-between gap-2 border-t px-2 pt-2">
  <div
    class="flex overflow-hidden rounded-md border"
    title={agent_supported ? undefined : AGENT_UNSUPPORTED_HINT}
  >
    {#each MODES as m (m.value)}
      <button
        type="button"
        class="px-3 py-1 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50 {mode ===
        m.value
          ? 'bg-accent text-accent-foreground'
          : 'text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground'}"
        aria-pressed={mode === m.value}
        disabled={m.value === "agent" && !agent_supported}
        onclick={() => on_set_mode(m.value)}
      >
        {m.label}
      </button>
    {/each}
  </div>
  {#if mode === "agent"}
    <div class="flex overflow-hidden rounded-md border">
      {#each PERMISSIONS as p (p.value)}
        <button
          type="button"
          class="px-2 py-1 text-xs font-medium {permission_mode === p.value
            ? 'bg-accent text-accent-foreground'
            : 'text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground'}"
          aria-pressed={permission_mode === p.value}
          title={p.hint}
          onclick={() => on_set_permission_mode(p.value)}
        >
          {p.label}
        </button>
      {/each}
    </div>
  {/if}
</div>
