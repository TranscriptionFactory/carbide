<script lang="ts">
  import type { Snippet } from "svelte";
  import "../app.css";
  import "../styles/fonts.css";
  import "../styles/tokens.css";
  import "../styles/themes.css";
  import "../styles/motion.css";
  import "../styles/layout_variants.css";
  import "../styles/component_overrides.css";
  import "prosemirror-view/style/prosemirror.css";
  import "../styles/editor.css";
  import "../styles/forced_colors.css";
  import "../styles/print.css";
  import "katex/dist/katex.min.css";
  import { Toaster } from "$lib/components/ui/sonner";
  import { toast } from "svelte-sonner";
  import { create_logger } from "$lib/shared/utils/logger";
  import { error_message } from "$lib/shared/utils/error_message";
  import { install_drop_guard } from "$lib/shared/utils/drop_guard";
  import { onMount } from "svelte";

  const log = create_logger("app");

  let { children }: { children: Snippet } = $props();

  onMount(() => {
    let last_toast_time = 0;
    const TOAST_THROTTLE_MS = 3000;

    function throttled_error_toast(
      label: string,
      detail: string,
      origin?: unknown,
    ) {
      console.error(`[${label}]`, origin ?? detail);
      log.error(label, { error: detail });
      const now = Date.now();
      if (now - last_toast_time < TOAST_THROTTLE_MS) return;
      last_toast_time = now;
      toast.error(detail || "Something went wrong");
    }

    const on_error = (event: ErrorEvent) => {
      event.preventDefault();
      if (!event.error) return;
      throttled_error_toast(
        "Unhandled error",
        error_message(event.error),
        event.error,
      );
    };

    const on_rejection = (event: PromiseRejectionEvent) => {
      event.preventDefault();
      if (!event.reason) return;
      throttled_error_toast(
        "Unhandled rejection",
        error_message(event.reason),
        event.reason,
      );
    };

    window.addEventListener("error", on_error);
    window.addEventListener("unhandledrejection", on_rejection);

    const dispose_drop_guard = install_drop_guard(window);

    return () => {
      window.removeEventListener("error", on_error);
      window.removeEventListener("unhandledrejection", on_rejection);
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
