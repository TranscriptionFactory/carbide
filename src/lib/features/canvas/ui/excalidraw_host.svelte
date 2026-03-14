<script lang="ts">
  import SandboxedIframe from "$lib/shared/ui/sandboxed_iframe.svelte";
  import type { ExcalidrawScene } from "$lib/features/canvas/state/canvas_store.svelte";

  interface Props {
    scene: ExcalidrawScene;
    theme: "light" | "dark";
    on_change: (
      elements: unknown[],
      appState: Record<string, unknown>,
      dirty: boolean,
    ) => void;
  }

  let { scene, theme, on_change }: Props = $props();

  let iframe: SandboxedIframe | undefined = $state();
  let is_ready = $state(false);
  let pending_scene: ExcalidrawScene | null = $state(null);

  const src = "badgerly-excalidraw://localhost/index.html";
  const origin = "badgerly-excalidraw://localhost";

  let resolve_scene: ((scene: ExcalidrawScene) => void) | null = null;

  function handle_message(data: unknown) {
    const msg = data as { type: string; [key: string]: unknown };
    if (!msg || typeof msg !== "object" || !("type" in msg)) return;

    switch (msg.type) {
      case "ready":
        is_ready = true;
        iframe?.post_message({
          type: "init_scene",
          scene: pending_scene ?? scene,
        });
        pending_scene = null;
        break;

      case "on_change":
        on_change(
          msg.elements as unknown[],
          msg.appState as Record<string, unknown>,
          msg.dirty as boolean,
        );
        break;

      case "scene_response":
        if (resolve_scene) {
          resolve_scene(msg.scene as ExcalidrawScene);
          resolve_scene = null;
        }
        break;
    }
  }

  $effect(() => {
    if (is_ready) {
      iframe?.post_message({ type: "theme_sync", theme });
    }
  });

  export async function get_scene(): Promise<ExcalidrawScene> {
    return new Promise((resolve) => {
      if (resolve_scene) {
        resolve_scene(scene);
      }
      resolve_scene = resolve;
      iframe?.post_message({ type: "get_scene" });

      setTimeout(() => {
        if (resolve_scene === resolve) {
          resolve_scene = null;
          resolve(scene);
        }
      }, 3000);
    });
  }
</script>

<div class="ExcalidrawHost">
  <SandboxedIframe
    bind:this={iframe}
    {src}
    {origin}
    title="Excalidraw Drawing"
    on_message={handle_message}
    sandbox="allow-scripts"
    class="ExcalidrawHost__iframe"
  />
</div>

<style>
  .ExcalidrawHost {
    width: 100%;
    height: 100%;
    position: relative;
  }

  .ExcalidrawHost :global(.ExcalidrawHost__iframe) {
    width: 100%;
    height: 100%;
    border: none;
  }
</style>
