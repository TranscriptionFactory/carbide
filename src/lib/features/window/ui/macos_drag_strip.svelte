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
    z-index: 40;
    height: var(--macos-drag-strip-height);
    -webkit-app-region: drag;
    user-select: none;
  }
</style>
