<script lang="ts" module>
  import type {
    PermissionOptionKind,
    PermissionOptionSpec,
  } from "$lib/features/assistant/types/agent_events";

  export type PermissionResponse =
    | { option_id: string; kind: PermissionOptionKind }
    | { kind: "cancelled" };
</script>

<script lang="ts">
  import { ChevronDown } from "@lucide/svelte";
  import { Button } from "$lib/components/ui/button";
  import * as Popover from "$lib/components/ui/popover";
  import { dedupe_options } from "$lib/features/assistant/domain/permission_outcome";

  type Props = {
    options: PermissionOptionSpec[];
    busy?: boolean;
    on_respond: (choice: PermissionResponse) => void;
  };

  let { options, busy = false, on_respond }: Props = $props();

  const unique = $derived(dedupe_options(options));

  function of_kind(
    specs: PermissionOptionSpec[],
    kind: PermissionOptionKind,
  ): PermissionOptionSpec | null {
    return specs.find((spec) => spec.kind === kind) ?? null;
  }

  const primary = $derived(
    of_kind(unique, "allow_once") ?? of_kind(unique, "allow_always"),
  );
  const escalation = $derived.by(() => {
    const always = of_kind(unique, "allow_always");
    return always !== null && always !== primary ? always : null;
  });
  const refusal = $derived(
    of_kind(unique, "reject_once") ?? of_kind(unique, "reject_always"),
  );

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

  function respond(option: PermissionOptionSpec): void {
    on_respond({ option_id: option.option_id, kind: option.kind });
  }
</script>

<div class="PermissionPrompt" data-testid="permission-prompt">
  <Button
    variant="ghost"
    size="sm"
    class="text-muted-foreground"
    disabled={busy}
    data-testid="permission-refuse"
    onclick={() => {
      if (refusal) respond(refusal);
      else on_respond({ kind: "cancelled" });
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
        disabled={busy}
        data-testid="permission-primary"
        onclick={() => respond(primary)}
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
              disabled={busy}
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
            disabled={busy}
            data-testid="permission-escalate-option"
            onclick={() => respond(escalation)}
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
