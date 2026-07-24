<script lang="ts">
  import RagInput from "$lib/features/rag/ui/rag_input.svelte";
  import type { RagStore } from "$lib/features/rag";

  let {
    store,
    on_submit,
  }: { store: RagStore; on_submit: (question: string) => void } = $props();
</script>

<RagInput
  bind:value={store.draft}
  providers={[]}
  provider_id=""
  scope={{}}
  folder_paths={[]}
  tags={[]}
  saved_views={[]}
  is_loading={false}
  is_streaming={false}
  readiness_state="indexing"
  submit_label="Ask"
  suggest_notes={async () => []}
  {on_submit}
  on_stop={() => {}}
  on_provider_change={() => {}}
  on_scope_change={() => {}}
/>
