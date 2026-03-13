<script lang="ts">
  interface Props {
    id: string;
    text: string;
  }

  let { text }: Props = $props();
</script>

<span class="StatusBar__item">
  {text}
</span>
