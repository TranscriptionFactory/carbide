<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import RotateCcw from "@lucide/svelte/icons/rotate-ccw";

  type Props = {
    role_label: string;
    color: string;
    on_change: (color: string) => void;
    on_reset: () => void;
    on_close: () => void;
  };

  let { role_label, color, on_change, on_reset, on_close }: Props = $props();

  let hex_input = $state("");

  $effect(() => {
    hex_input = color;
  });

  let hue_canvas: HTMLCanvasElement | undefined = $state();
  let pad_canvas: HTMLCanvasElement | undefined = $state();

  const PAD_SIZE = 180;
  const HUE_HEIGHT = 16;

  let current_hue = $state(0);
  let current_lightness = $state(0.5);
  let current_chroma = $state(0.1);

  $effect(() => {
    const match = color.match(
      /oklch\((\d+\.?\d*)\s+(\d+\.?\d*)\s+(\d+\.?\d*)\)/,
    );
    if (match?.[1] && match[2] && match[3]) {
      current_lightness = parseFloat(match[1]);
      current_chroma = parseFloat(match[2]);
      current_hue = parseFloat(match[3]);
    }
  });

  $effect(() => {
    if (!hue_canvas) return;
    const ctx = hue_canvas.getContext("2d");
    if (!ctx) return;
    hue_canvas.width = PAD_SIZE;
    hue_canvas.height = HUE_HEIGHT;
    for (let x = 0; x < PAD_SIZE; x++) {
      const h = (x / PAD_SIZE) * 360;
      ctx.fillStyle = `oklch(0.65 0.15 ${h})`;
      ctx.fillRect(x, 0, 1, HUE_HEIGHT);
    }
  });

  $effect(() => {
    if (!pad_canvas) return;
    const ctx = pad_canvas.getContext("2d");
    if (!ctx) return;
    pad_canvas.width = PAD_SIZE;
    pad_canvas.height = PAD_SIZE;
    for (let y = 0; y < PAD_SIZE; y++) {
      const l = 1 - y / PAD_SIZE;
      for (let x = 0; x < PAD_SIZE; x++) {
        const c = (x / PAD_SIZE) * 0.35;
        ctx.fillStyle = `oklch(${l} ${c} ${current_hue})`;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  });

  function emit() {
    const v = `oklch(${current_lightness.toFixed(3)} ${current_chroma.toFixed(4)} ${current_hue.toFixed(1)})`;
    hex_input = v;
    on_change(v);
  }

  function handle_pad_pointer(e: PointerEvent) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    current_lightness = 1 - y;
    current_chroma = x * 0.35;
    emit();
  }

  function handle_hue_pointer(e: PointerEvent) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    current_hue = x * 360;
    emit();
  }

  let dragging_pad = $state(false);
  let dragging_hue = $state(false);

  function pad_down(e: PointerEvent) {
    dragging_pad = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    handle_pad_pointer(e);
  }

  function hue_down(e: PointerEvent) {
    dragging_hue = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    handle_hue_pointer(e);
  }

  function handle_input_change() {
    const trimmed = hex_input.trim();
    if (trimmed.startsWith("oklch(")) {
      on_change(trimmed);
    }
  }

  const pad_thumb_x = $derived(
    `${((current_chroma / 0.35) * 100).toFixed(1)}%`,
  );
  const pad_thumb_y = $derived(
    `${((1 - current_lightness) * 100).toFixed(1)}%`,
  );
  const hue_thumb_x = $derived(`${((current_hue / 360) * 100).toFixed(1)}%`);
</script>

<div class="ColorPopover">
  <div class="ColorPopover__header">
    <span class="ColorPopover__role">{role_label}</span>
    <button
      type="button"
      class="ColorPopover__close"
      onclick={on_close}
      aria-label="Close">&times;</button
    >
  </div>

  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="ColorPopover__pad"
    onpointerdown={pad_down}
    onpointermove={(e) => {
      if (dragging_pad) handle_pad_pointer(e);
    }}
    onpointerup={() => {
      dragging_pad = false;
    }}
  >
    <canvas bind:this={pad_canvas} class="ColorPopover__pad-canvas"></canvas>
    <div
      class="ColorPopover__pad-thumb"
      style="left: {pad_thumb_x}; top: {pad_thumb_y}"
    ></div>
  </div>

  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="ColorPopover__hue-strip"
    onpointerdown={hue_down}
    onpointermove={(e) => {
      if (dragging_hue) handle_hue_pointer(e);
    }}
    onpointerup={() => {
      dragging_hue = false;
    }}
  >
    <canvas bind:this={hue_canvas} class="ColorPopover__hue-canvas"></canvas>
    <div class="ColorPopover__hue-thumb" style="left: {hue_thumb_x}"></div>
  </div>

  <div class="ColorPopover__input-row">
    <Input
      type="text"
      bind:value={hex_input}
      onchange={handle_input_change}
      class="ColorPopover__input"
      placeholder="oklch(0.5 0.1 200)"
    />
    <span class="ColorPopover__swatch" style="background: {color}"></span>
  </div>

  <div class="ColorPopover__actions">
    <Button variant="ghost" size="sm" onclick={on_reset}>
      <RotateCcw />
      Reset to auto
    </Button>
  </div>
</div>

<style>
  .ColorPopover {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-3);
    width: 220px;
  }

  .ColorPopover__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .ColorPopover__role {
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--foreground);
  }

  .ColorPopover__close {
    font-size: 1.25rem;
    color: var(--muted-foreground);
    background: transparent;
    border: none;
    line-height: 1;
    padding: 0 var(--space-1);
  }

  .ColorPopover__close:hover {
    color: var(--foreground);
  }

  .ColorPopover__pad {
    position: relative;
    width: 100%;
    aspect-ratio: 1;
    border-radius: var(--radius-sm, 0.25rem);
    overflow: hidden;
    cursor: crosshair;
    border: 1px solid var(--border);
  }

  .ColorPopover__pad-canvas {
    width: 100%;
    height: 100%;
    display: block;
  }

  .ColorPopover__pad-thumb {
    position: absolute;
    width: 12px;
    height: 12px;
    border: 2px solid white;
    border-radius: 50%;
    box-shadow:
      0 0 0 1px oklch(0 0 0 / 30%),
      0 1px 3px oklch(0 0 0 / 30%);
    transform: translate(-50%, -50%);
    pointer-events: none;
  }

  .ColorPopover__hue-strip {
    position: relative;
    height: 16px;
    border-radius: var(--radius-sm, 0.25rem);
    overflow: hidden;
    cursor: pointer;
    border: 1px solid var(--border);
  }

  .ColorPopover__hue-canvas {
    width: 100%;
    height: 100%;
    display: block;
  }

  .ColorPopover__hue-thumb {
    position: absolute;
    top: 0;
    width: 4px;
    height: 100%;
    background: white;
    border: 1px solid oklch(0 0 0 / 40%);
    border-radius: 1px;
    transform: translateX(-50%);
    pointer-events: none;
  }

  .ColorPopover__input-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  :global(.ColorPopover__input) {
    flex: 1;
    font-size: var(--text-xs) !important;
    font-family: var(--font-mono, ui-monospace, monospace) !important;
  }

  .ColorPopover__swatch {
    width: 24px;
    height: 24px;
    border-radius: var(--radius-sm, 0.25rem);
    border: 1px solid var(--border);
    flex-shrink: 0;
  }

  .ColorPopover__actions {
    display: flex;
    justify-content: flex-end;
  }

  :global(.ColorPopover__actions svg) {
    width: 14px;
    height: 14px;
  }
</style>
