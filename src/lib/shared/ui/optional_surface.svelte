<script lang="ts" generics="Props extends Record<string, unknown>">
  import type { Component } from "svelte";
  type OptionalSurfaceModule = {
    default: Component<Props>;
  };

  interface PropsDefinition {
    loader: () => Promise<OptionalSurfaceModule>;
    component_props: Props;
    loading_label?: string;
    error_label?: string;
  }

  let {
    loader,
    component_props,
    loading_label = "Loading…",
    error_label = "Failed to load",
  }: PropsDefinition = $props();

  let SurfaceComponent = $state<Component<Props> | null>(null);
  let load_error = $state<string | null>(null);
  let load_token = 0;

  async function load_surface() {
    const token = ++load_token;
    SurfaceComponent = null;
    load_error = null;

    try {
      const mod = await loader();
      if (token !== load_token) return;
      SurfaceComponent = mod.default;
    } catch (error) {
      if (token !== load_token) return;
      load_error = error instanceof Error ? error.message : error_label;
    }
  }

  $effect(() => {
    void loader;
    void load_surface();
  });
</script>

{#if SurfaceComponent}
  <SurfaceComponent {...component_props} />
{:else if load_error}
  <div class="OptionalSurface OptionalSurface--error">
    <span>{load_error}</span>
  </div>
{:else}
  <div class="OptionalSurface">
    <span>{loading_label}</span>
  </div>
{/if}

<style>
  .OptionalSurface {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
    min-height: 0;
    color: var(--muted-foreground);
    font-size: var(--text-sm);
  }

  .OptionalSurface--error {
    color: var(--destructive);
  }
</style>
