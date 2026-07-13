<script lang="ts">
  import { toast } from "svelte-sonner";
  import { announce, live_announcer } from "./live_announcer.svelte";

  /* svelte-sonner puts aria-live on each dynamically-inserted toast, which
     screen readers often miss (region must pre-exist in the DOM). Mirroring
     titles here guarantees announcement; readers that do honor sonner's
     inline region may announce twice — accepted over silence. */
  const announced_toast_titles = new Map<number | string, string>();

  $effect(() => {
    for (const t of toast.getActiveToasts()) {
      if (typeof t.title !== "string") continue;
      if (announced_toast_titles.get(t.id) === t.title) continue;
      announced_toast_titles.set(t.id, t.title);
      announce(t.title);
    }
  });
</script>

<div class="sr-only" role="status" aria-live="polite" aria-atomic="true">
  {live_announcer.message}
</div>
