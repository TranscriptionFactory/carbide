<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    type?: string;
    value?: string;
    onValueChange?: (value: string | undefined) => void;
    children?: Snippet;
  }

  let {
    type: _type = "single",
    value = "",
    onValueChange,
    children,
  }: Props = $props();

  function handle_click(event: MouseEvent) {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const option = target.closest("[data-value]");
    if (!(option instanceof HTMLElement)) {
      return;
    }

    const next_value = option.dataset["value"];
    if (!next_value) {
      return;
    }

    value = next_value;
    onValueChange?.(next_value);
  }
</script>

<div
  data-testid="select-root"
  data-value={value}
  role="listbox"
  tabindex="0"
  onclick={handle_click}
  onkeydown={() => {}}
>
  {@render children?.()}
</div>
