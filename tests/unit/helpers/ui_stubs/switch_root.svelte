<script lang="ts">
  interface Props {
    checked?: boolean;
    onCheckedChange?: (value: boolean) => void;
    "aria-label"?: string;
  }

  let {
    checked = false,
    onCheckedChange,
    "aria-label": aria_label,
  }: Props = $props();

  function handle_change(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    onCheckedChange?.(input.checked);
  }
</script>

<input
  type="checkbox"
  {checked}
  aria-label={aria_label}
  onchange={handle_change}
/>
