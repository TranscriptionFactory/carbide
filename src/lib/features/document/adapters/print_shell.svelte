<script lang="ts">
  import { onMount } from "svelte";
  import { getCurrentWindow } from "@tauri-apps/api/window";

  const STORAGE_KEY = "carbide:print_data";

  onMount(() => {
    const html = localStorage.getItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_KEY);

    if (!html) {
      void getCurrentWindow().close();
      return;
    }

    document.open();
    document.write(html);
    document.close();

    requestAnimationFrame(() => {
      window.print();
      setTimeout(() => {
        void getCurrentWindow().close();
      }, 500);
    });
  });
</script>
