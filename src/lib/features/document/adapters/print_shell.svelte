<script lang="ts">
  import { onMount } from "svelte";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { PRINT_STORAGE_KEY } from "$lib/features/document/domain/print_render";

  onMount(() => {
    const html = localStorage.getItem(PRINT_STORAGE_KEY);
    localStorage.removeItem(PRINT_STORAGE_KEY);

    if (!html) {
      void getCurrentWindow().close();
      return;
    }

    document.open();
    document.write(html);
    document.close();

    window.onafterprint = () => {
      void getCurrentWindow().close();
    };

    requestAnimationFrame(() => {
      window.print();
    });
  });
</script>
