<script lang="ts">
  import { Switch } from "$lib/components/ui/switch";
  import type { AssistantChatMode } from "$lib/features/assistant/types/session";

  type Props = {
    mode: AssistantChatMode;
    auto_approve: boolean;
    agent_supported: boolean;
    // Copy, not a backend discriminant: the provider's agent_scope_copy owns
    // what auto-approve actually grants, so this toggle cannot understate a
    // harness with unrestricted shell access.
    auto_approve_hint: string;
    on_set_mode: (mode: AssistantChatMode) => void;
    on_set_auto_approve: (enabled: boolean) => void;
  };

  let {
    mode,
    auto_approve,
    agent_supported,
    auto_approve_hint,
    on_set_mode,
    on_set_auto_approve,
  }: Props = $props();

  const AGENT_UNSUPPORTED_HINT = "Agent mode requires a tool-capable provider";

  const MODES: Array<{ value: AssistantChatMode; label: string }> = [
    { value: "ask", label: "Ask" },
    { value: "agent", label: "Agent" },
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
    <div class="flex items-center gap-2" title={auto_approve_hint}>
      <label
        for="assistant-auto-approve"
        class="text-xs font-medium text-muted-foreground"
      >
        Auto-approve
      </label>
      <Switch
        id="assistant-auto-approve"
        checked={auto_approve}
        onCheckedChange={on_set_auto_approve}
        data-testid="auto-approve-switch"
      />
    </div>
  {/if}
</div>
