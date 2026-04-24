<script lang="ts">
  import { ACTION_IDS } from "$lib/app";
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import { Button } from "$lib/components/ui/button";
  import AiAssistantContent from "$lib/features/ai/ui/ai_assistant_content.svelte";

  const { stores, action_registry } = use_app_context();

  const session = $derived(stores.ai.dialog);
  const ai_disabled = $derived(!stores.ui.editor_settings.ai_enabled);
  const has_session = $derived(session.open && session.context !== null);
  const original_text = $derived(
    session.context
      ? session.context.target === "selection"
        ? (session.context.selection?.text ?? "")
        : session.context.note_markdown
      : "",
  );

  function hide_panel() {
    stores.ui.bottom_panel_open = false;
  }

  function start_session() {
    void action_registry.execute(ACTION_IDS.ai_open_assistant);
  }

  $effect(() => {
    if (!has_session || session.is_executing || session.result) {
      return;
    }

    const current_note = stores.editor.open_note;
    if (!current_note) return;

    if (session.context?.note_path !== current_note.meta.path) {
      start_session();
      return;
    }

    const selection = stores.editor.selection;
    const markdown = current_note.markdown;

    if (
      selection?.text === session.context?.selection?.text &&
      markdown === session.context?.note_markdown
    ) {
      return;
    }

    void action_registry.execute(ACTION_IDS.ai_update_context, {
      note_path: current_note.meta.path,
      note_title: current_note.meta.title || current_note.meta.name,
      note_markdown: markdown,
      selection,
      target: session.context?.target ?? "full_note",
    });
  });
</script>

{#if ai_disabled}
  <div
    class="flex h-full flex-col items-center justify-center gap-3 p-6 text-center"
  >
    <div class="space-y-2">
      <h2 class="text-base font-semibold">AI Assistant Disabled</h2>
      <p class="text-sm text-muted-foreground">
        Re-enable AI in Settings to use configured AI backends.
      </p>
    </div>
  </div>
{:else if !has_session}
  <div
    class="flex h-full flex-col items-center justify-center gap-4 p-6 text-center"
  >
    <div class="space-y-2">
      <h2 class="text-base font-semibold">AI Assistant</h2>
      <p class="text-sm text-muted-foreground">
        Open a note to start a draft-editing session and review changes before
        applying them.
      </p>
    </div>
    <Button onclick={start_session}>Use Current Note</Button>
  </div>
{:else}
  <AiAssistantContent
    provider_id={session.provider_id}
    providers={stores.ui.editor_settings.ai_providers}
    mode={session.mode}
    prompt={session.prompt}
    cli_status={session.cli_status}
    cli_error={session.cli_error}
    target={session.context?.target ?? "full_note"}
    note_path={session.context?.note_path ?? null}
    note_title={session.context?.note_title ?? null}
    selection_text={session.context?.selection?.text ?? null}
    {original_text}
    is_executing={session.is_executing}
    turns={session.turns}
    result={session.result}
    close_label="Hide Panel"
    on_provider_change={(value) =>
      void action_registry.execute(ACTION_IDS.ai_update_provider, value)}
    on_mode_change={(value) =>
      void action_registry.execute(ACTION_IDS.ai_update_mode, value)}
    on_target_change={(value) =>
      void action_registry.execute(ACTION_IDS.ai_update_target, value)}
    on_prompt_change={(value) =>
      void action_registry.execute(ACTION_IDS.ai_update_prompt, value)}
    on_execute={() => void action_registry.execute(ACTION_IDS.ai_execute)}
    on_apply={(output) =>
      void action_registry.execute(ACTION_IDS.ai_apply_result, output)}
    on_clear_result={() =>
      void action_registry.execute(ACTION_IDS.ai_clear_result)}
    on_close={hide_panel}
  />
{/if}
