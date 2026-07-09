<script lang="ts">
  import { MACOS_TRAFFIC_LIGHT_SAFE_PADDING } from "$lib/features/window/domain/platform";
</script>

<div
  class="MacosDragStrip"
  style="padding-inline-start:{MACOS_TRAFFIC_LIGHT_SAFE_PADDING}px"
  data-tauri-drag-region
  aria-hidden="true"
></div>

<style>
  .MacosDragStrip {
    position: fixed;
    top: 0;
    inset-inline: 0;
    /* Must sit above workspace content: themes that position .WorkspaceLayout
       (triptych/cockpit/theater/dashboard) otherwise hit-test their top
       padding band over the strip, so a titlebar mousedown starts a text
       selection instead of a window drag. Stays below portaled overlays
       (z-50) and floating theme chrome (z>=150); theme CSS offsets any
       top-band ActivityBar below the strip rather than relying on z-order */
    z-index: 40;
    height: var(--macos-drag-strip-height);
    -webkit-app-region: drag;
    user-select: none;
  }
</style>
