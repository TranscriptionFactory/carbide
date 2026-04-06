<script lang="ts">
  import * as Switch from "$lib/components/ui/switch/index.js";
  import { Slider } from "$lib/components/ui/slider";
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import type { SmartLinkRule } from "$lib/features/smart_links";
  import { format_rule_name } from "$lib/features/smart_links/domain/format_rule";

  const { stores, services } = use_app_context();

  const rule_groups = $derived(stores.smart_links.rule_groups);
  const status = $derived(stores.smart_links.rules_status);

  $effect(() => {
    if (status === "idle") {
      void services.smart_links.load_rules();
    }
  });

  function on_toggle_rule(group_id: string, rule: SmartLinkRule) {
    void services.smart_links.toggle_rule(group_id, rule.id, !rule.enabled);
  }

  function on_weight_change(
    group_id: string,
    rule_id: string,
    value: number | undefined,
  ) {
    if (value === undefined) return;
    void services.smart_links.update_weight(group_id, rule_id, value / 100);
  }

  function on_toggle_group(group_id: string, enabled: boolean) {
    void services.smart_links.toggle_group(group_id, enabled);
  }
</script>

{#if status === "loading"}
  <p class="SmartLinksSettings__state">Loading rules...</p>
{:else if status === "error"}
  <p class="SmartLinksSettings__state SmartLinksSettings__state--error">
    Failed to load smart link rules
  </p>
{:else if rule_groups.length > 0}
  {#each rule_groups as group (group.id)}
    <div class="SmartLinksSettings__group">
      <div class="SmartLinksSettings__group-header">
        <span class="SmartLinksSettings__group-name">
          {format_rule_name(group.name)}
        </span>
        <Switch.Root
          checked={group.enabled}
          onCheckedChange={(v: boolean) => on_toggle_group(group.id, v)}
        />
      </div>

      {#if group.enabled}
        {#each group.rules as rule (rule.id)}
          <div
            class="SmartLinksSettings__rule"
            class:SmartLinksSettings__rule--disabled={!rule.enabled}
          >
            <div class="SmartLinksSettings__rule-header">
              <span class="SmartLinksSettings__rule-name">
                {format_rule_name(rule.name)}
              </span>
              <Switch.Root
                checked={rule.enabled}
                onCheckedChange={() => on_toggle_rule(group.id, rule)}
              />
            </div>
            {#if rule.enabled}
              <div class="SmartLinksSettings__rule-weight">
                <span class="SmartLinksSettings__weight-label">Weight</span>
                <Slider
                  type="single"
                  value={Math.round(rule.weight * 100)}
                  onValueChange={(v: number | undefined) =>
                    on_weight_change(group.id, rule.id, v)}
                  min={5}
                  max={100}
                  step={5}
                  class="w-24"
                />
                <span class="SmartLinksSettings__weight-value">
                  {Math.round(rule.weight * 100)}%
                </span>
              </div>
            {/if}
          </div>
        {/each}
      {/if}
    </div>
  {/each}
{/if}

<style>
  .SmartLinksSettings__state {
    font-size: var(--text-xs);
    color: var(--muted-foreground);
    padding: var(--space-1) 0;
    margin: 0;
  }

  .SmartLinksSettings__state--error {
    color: var(--destructive);
  }

  .SmartLinksSettings__group {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .SmartLinksSettings__group-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
  }

  .SmartLinksSettings__group-name {
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--foreground);
  }

  .SmartLinksSettings__rule {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-sm);
    background-color: var(--muted);
  }

  .SmartLinksSettings__rule--disabled {
    opacity: 0.6;
  }

  .SmartLinksSettings__rule-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
  }

  .SmartLinksSettings__rule-name {
    font-size: var(--text-sm);
    color: var(--foreground);
  }

  .SmartLinksSettings__rule-weight {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .SmartLinksSettings__weight-label {
    font-size: var(--text-xs);
    color: var(--muted-foreground);
    flex-shrink: 0;
  }

  .SmartLinksSettings__weight-value {
    font-size: var(--text-xs);
    color: var(--muted-foreground);
    min-width: 2.5rem;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
</style>
