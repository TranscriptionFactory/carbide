<script lang="ts">
  import type { Snippet } from "svelte";
  import "../app.css";
  import "../styles/fonts.css";
  import "../styles/design_tokens.css";
  import "../styles/theme-monolith.css";
  import "../styles/theme-workbench.css";
  import "../styles/theme-command-deck.css";
  import "../styles/theme-grounded-heavy.css";
  import "../styles/theme-hud.css";
  import "../styles/theme-zen-deck.css";
  import "../styles/theme-dashboard.css";
  import "../styles/theme-spotlight.css";
  import "../styles/theme-cockpit.css";
  import "../styles/theme-theater.css";
  import "../styles/theme-triptych.css";
  import "../styles/component_overrides.css";
  import "prosemirror-view/style/prosemirror.css";
  import "../styles/editor.css";
  import "katex/dist/katex.min.css";
  import { Toaster } from "$lib/components/ui/sonner";
  import { toast } from "svelte-sonner";
  import { create_logger } from "$lib/shared/utils/logger";
  import { error_message } from "$lib/shared/utils/error_message";
  import { onMount } from "svelte";

  const log = create_logger("app");

  let { children }: { children: Snippet } = $props();

  onMount(() => {
    let last_toast_time = 0;
    const TOAST_THROTTLE_MS = 3000;

    function throttled_error_toast(label: string, detail: string) {
      log.error(label, { error: detail });
      const now = Date.now();
      if (now - last_toast_time < TOAST_THROTTLE_MS) return;
      last_toast_time = now;
      toast.error(detail || "Something went wrong");
    }

    const on_error = (event: ErrorEvent) => {
      event.preventDefault();
      if (!event.error) return;
      throttled_error_toast("Unhandled error", error_message(event.error));
    };

    const on_rejection = (event: PromiseRejectionEvent) => {
      event.preventDefault();
      if (!event.reason) return;
      throttled_error_toast("Unhandled rejection", error_message(event.reason));
    };

    window.addEventListener("error", on_error);
    window.addEventListener("unhandledrejection", on_rejection);

    return () => {
      window.removeEventListener("error", on_error);
      window.removeEventListener("unhandledrejection", on_rejection);
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
