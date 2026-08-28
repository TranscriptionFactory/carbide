<script lang="ts">
  import type { Snippet } from "svelte";
  import "../app.css";
  import "../styles/fonts.css";
  import "../styles/tokens.css";
  import "../styles/themes.css";
  import "../styles/motion.css";
  import "../styles/layout_presets.css";
  import "../styles/component_overrides.css";
  import "prosemirror-view/style/prosemirror.css";
  import "../styles/editor.css";
  import "../styles/editor_components.css";
  import "../styles/forced_colors.css";
  import "../styles/print.css";
  import "katex/dist/katex.min.css";
  import { Toaster } from "$lib/components/ui/sonner";
  import { toast } from "$lib/shared/ui/toast";
  import { install_drop_guard } from "$lib/shared/utils/drop_guard";
  import { install_unhandled_error_guard } from "$lib/shared/utils/unhandled_error_guard";
  import { onMount } from "svelte";

  let { children }: { children: Snippet } = $props();

  onMount(() => {
    const dispose_unhandled_error_guard = install_unhandled_error_guard(
      window,
      toast.error,
    );
    const dispose_drop_guard = install_drop_guard(window);

    return () => {
      dispose_unhandled_error_guard();
      dispose_drop_guard();
    };
  });
</script>

<main class="h-full">
  <Toaster
    position="bottom-right"
    offset={36}
    style="
      --normal-bg: var(--color-popover);
      --normal-text: var(--color-popover-foreground);
      --normal-border: var(--color-border);
      --success-bg: var(--interactive-bg);
      --success-text: var(--interactive-text-on-bg);
      --success-border: var(--interactive-border-subtle);
      --error-bg: var(--color-popover);
      --error-text: var(--color-popover-foreground);
      --error-border: var(--color-destructive);
      --warning-bg: var(--warning-bg);
      --warning-text: var(--warning-text-on-bg);
      --warning-border: var(--warning-border);
    "
  />
  {@render children()}
</main>
