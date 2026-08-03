<script lang="ts">
  // Pin 5: the bottom "Assistant" tab is a PROJECTION of the one assistant
  // chat — both this mount and the sidebar mount share stores.assistant_chat,
  // so a conversation started in one continues in the other. Panel-only
  // behavior gets a home here without growing props on the shared component.
  import ChatPanel from "$lib/features/assistant/ui/chat_panel.svelte";
</script>

<ChatPanel />
