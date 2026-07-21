<script lang="ts">
  type Props = { size?: number };
  let { size = 48 }: Props = $props();

  let clicked = $state(false);
  let click_seq = $state(0);
  let reset_timer: ReturnType<typeof setTimeout> | undefined;

  function handle_click() {
    clicked = true;
    click_seq += 1;
    clearTimeout(reset_timer);
    reset_timer = setTimeout(() => (clicked = false), 1200);
  }

  $effect(() => () => clearTimeout(reset_timer));
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 30 30"
  fill="none"
  aria-hidden="true"
  class="CarbideBlob"
  onclick={handle_click}
  onmousedown={(e) => e.preventDefault()}
>
  {#key click_seq}
    <g class="CarbideBlob__group" class:CarbideBlob__group--clicked={clicked}>
      <path
        class="CarbideBlob__body"
        d="M15.5 3C21.5 2.6 26.4 7.2 26.9 13.2C27.4 19.5 23.4 25.6 17 26.7C10.8 27.8 4.6 24 3.3 17.8C2 11.6 5.6 5.4 11.5 3.7C12.8 3.3 14.2 3.1 15.5 3Z"
      />
      {#if clicked}
        <path class="CarbideBlob__happy-eye" d="M9 14.3Q10.5 11.9 12 14.3" />
        <path class="CarbideBlob__happy-eye" d="M18 14.3Q19.5 11.9 21 14.3" />
        <path class="CarbideBlob__smile" d="M11.5 18.5Q15 22 18.5 18.5" />
      {:else}
        <ellipse class="CarbideBlob__eye" cx="10.5" cy="14" rx="1.3" ry="2" />
        <ellipse
          class="CarbideBlob__eye CarbideBlob__eye--right"
          cx="19.5"
          cy="14"
          rx="1.3"
          ry="2"
        />
      {/if}
    </g>
  {/key}
</svg>

<style>
  .CarbideBlob {
    cursor: pointer;
    user-select: none;
    -webkit-user-select: none;
  }

  .CarbideBlob__group {
    transform-box: fill-box;
    transform-origin: center bottom;
  }

  .CarbideBlob__group--clicked {
    animation: carbide-blob-bounce 500ms ease-out;
  }

  .CarbideBlob__body {
    fill: var(--interactive);
  }

  .CarbideBlob__eye {
    fill: var(--background);
    transform-box: fill-box;
    transform-origin: center;
    animation: carbide-blob-blink 6s ease-in-out infinite;
  }

  .CarbideBlob__eye--right {
    animation-delay: 0.04s;
  }

  .CarbideBlob__happy-eye,
  .CarbideBlob__smile {
    stroke: var(--background);
    stroke-width: 1.4;
    stroke-linecap: round;
    fill: none;
  }

  @keyframes carbide-blob-blink {
    0%,
    28%,
    34%,
    100% {
      transform: scaleY(1);
    }
    30%,
    32% {
      transform: scaleY(0.05);
    }
  }

  @keyframes carbide-blob-bounce {
    0%,
    100% {
      transform: scaleY(1) scaleX(1);
    }
    20% {
      transform: scaleY(0.88) scaleX(1.08);
    }
    50% {
      transform: scaleY(1.06) scaleX(0.96);
    }
    75% {
      transform: scaleY(0.98) scaleX(1.01);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .CarbideBlob__eye,
    .CarbideBlob__group--clicked {
      animation: none;
    }
  }
</style>
