<script lang="ts">
  import { Tabs as TabsPrimitive } from "bits-ui";

  let {
    ref = $bindable(null),
    value = $bindable(""),
    ...restProps
  }: TabsPrimitive.RootProps = $props();
</script>

<TabsPrimitive.Root bind:ref bind:value data-slot="tabs" {...restProps} />
