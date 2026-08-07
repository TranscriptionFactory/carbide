<script lang="ts">
  import { ChevronDown } from "@lucide/svelte";
  import { Button } from "$lib/components/ui/button";
  import * as Popover from "$lib/components/ui/popover";
  import type { PermissionOptionSpec } from "$lib/features/assistant/types/agent_events";
  import {
    select_permission_options,
    type PermissionResponse,
  } from "$lib/features/assistant/domain/permission_outcome";

  type Props = {
    options: PermissionOptionSpec[];
    on_respond: (choice: PermissionResponse) => void;
  };

  let { options, on_respond }: Props = $props();

  const choices = $derived(select_permission_options(options));
  const primary = $derived(choices.primary);
  const escalation = $derived(choices.escalation);
  const refusal = $derived(choices.refusal);

  // One prompt, one answer: the parked request is gone after the first click,
  // so a second would resolve to nobody.
  let responded = $state(false);

  let primary_ref = $state<HTMLElement | null>(null);
  let focus_settled = false;

  // Focus is a loan, not a claim: only pull it to the primary action when the
  // panel already held it, so a prompt arriving mid-sentence never yanks the
  // caret out of the editor.
  $effect(() => {
    const button = primary_ref;
    if (focus_settled || button === null) return;
    focus_settled = true;
    const active = document.activeElement;
    if (!(active instanceof HTMLElement)) return;
    if (active.closest("[data-assistant-panel-root]") === null) return;
    button.focus();
  });

  function respond(choice: PermissionResponse): void {
    if (responded) return;
    responded = true;
    on_respond(choice);
  }

  function respond_with(option: PermissionOptionSpec): void {
    respond({ option_id: option.option_id, kind: option.kind });
  }
</script>

<div class="PermissionPrompt" data-testid="permission-prompt">
  <Button
    variant="ghost"
    size="sm"
    class="text-muted-foreground"
    disabled={responded}
    data-testid="permission-refuse"
    onclick={() => {
      if (refusal) respond_with(refusal);
      else respond({ kind: "cancelled" });
    }}
  >
    {refusal?.label ?? "Deny"}
  </Button>

  <div class="PermissionPrompt__grants">
    {#if primary}
      <Button
        bind:ref={primary_ref}
        variant="default"
        size="sm"
        disabled={responded}
        data-testid="permission-primary"
        onclick={() => respond_with(primary)}
      >
        {primary.label}
      </Button>
    {/if}

    {#if escalation}
      <Popover.Root>
        <Popover.Trigger>
          {#snippet child({ props })}
            <Button
              {...props}
              variant="outline"
              size="icon-sm"
              disabled={responded}
              aria-label="More permission options"
              data-testid="permission-escalate-trigger"
            >
              <ChevronDown />
            </Button>
          {/snippet}
        </Popover.Trigger>
        <Popover.Content align="end" sideOffset={4} class="w-auto p-1">
          <Button
            variant="ghost"
            size="sm"
            class="w-full justify-start"
            disabled={responded}
            data-testid="permission-escalate-option"
            onclick={() => respond_with(escalation)}
          >
            {escalation.label}
          </Button>
        </Popover.Content>
      </Popover.Root>
    {/if}
  </div>
</div>

<style>
  .PermissionPrompt {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-xs);
  }

  .PermissionPrompt__grants {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    margin-left: auto;
  }
</style>
