<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Button } from "$lib/components/ui/button";
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import type { TrustLevel, TrustScope } from "$lib/features/document/ports";

  const { stores, services } = use_app_context();
  const request = $derived(stores.document.pending_trust_request);
  let level = $state<TrustLevel>("live");

  $effect(() => {
    if (request) level = "live";
  });

  async function grant(scope: TrustScope): Promise<void> {
    await services.document.resolve_pending_trust(scope, level);
  }

  function cancel(): void {
    void services.document.resolve_pending_trust(null, "safe");
  }
</script>

<Dialog.Root
  open={request !== null}
  onOpenChange={(value: boolean) => {
    if (!value) cancel();
  }}
>
  <Dialog.Content class="max-w-md">
    <Dialog.Header>
      <Dialog.Title>Trust HTML file?</Dialog.Title>
      <Dialog.Description>
        Live mode runs scripts inside a sandbox with no access to Carbide or
        your vault. Network access is opt-in.
      </Dialog.Description>
    </Dialog.Header>
    {#if request}
      <div class="TrustedHtmlDialog__body">
        <div class="TrustedHtmlDialog__path">
          <span class="TrustedHtmlDialog__label">File</span>
          <code>{request.file_path}</code>
        </div>
        {#if request.folder_path}
          <div class="TrustedHtmlDialog__path">
            <span class="TrustedHtmlDialog__label">Folder</span>
            <code>{request.folder_path}</code>
          </div>
        {/if}
        <fieldset class="TrustedHtmlDialog__levels">
          <legend>Permission level</legend>
          <label>
            <input
              type="radio"
              name="trust-level"
              value="live"
              checked={level === "live"}
              onchange={() => (level = "live")}
            />
            <span>
              <strong>Live</strong> — run scripts, block network
            </span>
          </label>
          <label>
            <input
              type="radio"
              name="trust-level"
              value="live+net"
              checked={level === "live+net"}
              onchange={() => (level = "live+net")}
            />
            <span>
              <strong>Live + Network</strong> — run scripts, allow network requests
            </span>
          </label>
        </fieldset>
      </div>
    {/if}
    <Dialog.Footer>
      <Button variant="outline" onclick={cancel}>Cancel</Button>
      {#if request?.folder_path}
        <Button variant="secondary" onclick={() => grant("folder")}>
          Trust folder
        </Button>
      {/if}
      <Button onclick={() => grant("file")}>Trust file</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<style>
  .TrustedHtmlDialog__body {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    margin-block: var(--space-2);
  }

  .TrustedHtmlDialog__path {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    font-size: var(--text-sm);
  }

  .TrustedHtmlDialog__path code {
    background: var(--muted);
    padding: 2px var(--space-2);
    border-radius: var(--radius-sm);
    font-size: var(--text-xs);
    overflow-wrap: anywhere;
  }

  .TrustedHtmlDialog__label {
    width: 4rem;
    color: var(--muted-foreground);
    flex-shrink: 0;
  }

  .TrustedHtmlDialog__levels {
    border: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .TrustedHtmlDialog__levels legend {
    font-size: var(--text-sm);
    color: var(--muted-foreground);
    margin-bottom: var(--space-1);
  }

  .TrustedHtmlDialog__levels label {
    display: flex;
    align-items: flex-start;
    gap: var(--space-2);
    font-size: var(--text-sm);
    cursor: pointer;
  }
</style>
