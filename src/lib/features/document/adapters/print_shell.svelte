<script lang="ts">
  import { onMount } from "svelte";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import {
    PRINT_STORAGE_KEY,
    extract_print_content,
  } from "$lib/features/document/domain/print_render";

  let container: HTMLDivElement;

  onMount(() => {
    const raw = localStorage.getItem(PRINT_STORAGE_KEY);
    localStorage.removeItem(PRINT_STORAGE_KEY);

    if (!raw) {
      void getCurrentWindow().close();
      return;
    }

    const { css, body_html } = extract_print_content(raw);

    const style_el = document.createElement("style");
    style_el.textContent = css;
    document.head.appendChild(style_el);

    container.innerHTML = body_html;

    window.onafterprint = () => {
      void getCurrentWindow().close();
    };

    requestAnimationFrame(() => {
      window.print();
    });
  });
</script>

<div bind:this={container}></div>
