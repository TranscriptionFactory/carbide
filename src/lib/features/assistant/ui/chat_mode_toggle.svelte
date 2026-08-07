<script lang="ts">
  import type { AssistantChatMode } from "$lib/features/assistant/types/session";
  import type { AssistantPermissionMode } from "$lib/features/assistant/types/session";

  type Props = {
    mode: AssistantChatMode;
    permission_mode: AssistantPermissionMode;
    agent_supported: boolean;
    backend?: "native" | "harness" | null;
    on_set_mode: (mode: AssistantChatMode) => void;
    on_set_permission_mode: (mode: AssistantPermissionMode) => void;
  };

  let {
    mode,
    permission_mode,
    agent_supported,
    backend = null,
    on_set_mode,
    on_set_permission_mode,
  }: Props = $props();

  const AGENT_UNSUPPORTED_HINT = "Agent mode requires a tool-capable provider";

  const MODES: Array<{ value: AssistantChatMode; label: string }> = [
    { value: "ask", label: "Ask" },
    { value: "agent", label: "Agent" },
  ];

  // Power on a CLI harness is not "edit files in your vault" — the harness
  // runs unrestricted shell. The hint must say what the grant actually is.
  const power_hint = $derived(
    backend === "native"
      ? "Agent can edit files in your vault"
      : "Full system access — agent can run shell commands outside the vault",
  );

  const permissions = $derived<
    Array<{ value: AssistantPermissionMode; label: string; hint: string }>
  >([
    {
      value: "safe",
      label: "Safe",
      hint: "Note tools only — no shell or file edits",
    },
    {
      value: "power",
      label: "Power",
      hint: power_hint,
    },
  ]);
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
      {#each permissions as p (p.value)}
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
