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
    reset_timer = setTimeout(() => (clicked = false), 700);
  }

  $effect(() => () => clearTimeout(reset_timer));

  const reduced_motion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
</script>

<svg
  width={size}
  height={size}
  viewBox="280 140 695 920"
  fill="none"
  aria-hidden="true"
  class="CarbideFlame"
  onclick={handle_click}
  onmousedown={(e) => e.preventDefault()}
>
  <defs>
    <linearGradient id="carbide-flame-grad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#9452f5" />
      <stop offset="0.55" stop-color="#5a9cf6" />
      <stop offset="1" stop-color="#27e1f5" />
    </linearGradient>
    <filter
      id="carbide-flame-fire"
      x="-15%"
      y="-15%"
      width="130%"
      height="130%"
    >
      <feTurbulence
        type="fractalNoise"
        baseFrequency="0.012 0.03"
        numOctaves="2"
        seed="3"
        result="noise"
      >
        {#if !reduced_motion}
          <animate
            attributeName="baseFrequency"
            dur="6s"
            values="0.012 0.03;0.017 0.044;0.01 0.026;0.015 0.038;0.012 0.03"
            repeatCount="indefinite"
          />
        {/if}
      </feTurbulence>
      <feDisplacementMap
        in="SourceGraphic"
        in2="noise"
        scale="26"
        xChannelSelector="R"
        yChannelSelector="G"
      />
    </filter>
  </defs>
  {#key click_seq}
    <g class="CarbideFlame__flame" class:CarbideFlame__flame--flare={clicked}>
      <g filter="url(#carbide-flame-fire)" class="CarbideFlame__body">
        <path
          fill="url(#carbide-flame-grad)"
          d="M 595 146 L 596 205 L 594 227 L 588 259 L 575 303 L 562 334 L 541 374 L 510 422 L 472 474 L 460 498 L 456 498 L 450 483 L 440 433 L 439 399 L 446 343 L 439 347 L 421 365 L 395 396 L 368 435 L 350 466 L 333 500 L 318 536 L 299 598 L 291 639 L 288 668 L 288 725 L 291 751 L 298 784 L 309 819 L 321 848 L 335 875 L 353 903 L 376 932 L 405 961 L 436 986 L 461 1002 L 516 1028 L 547 1038 L 574 1044 L 605 1048 L 643 1049 L 670 1047 L 699 1042 L 740 1030 L 766 1019 L 802 999 L 833 977 L 875 937 L 899 907 L 921 872 L 937 839 L 947 813 L 956 782 L 963 745 L 965 725 L 965 677 L 955 612 L 935 545 L 903 473 L 866 412 L 843 382 L 841 382 L 840 406 L 831 437 L 819 456 L 804 470 L 796 474 L 791 423 L 779 372 L 761 324 L 735 275 L 703 231 L 672 198 L 628 163 L 610 152 Z"
        />
      </g>
      <path
        class="CarbideFlame__glyph"
        d="M 478 616 L 486 619 L 692 744 L 694 747 L 694 794 L 480 926 L 477 925 L 478 868 L 636 773 L 637 770 L 478 673 Z"
      />
      <path
        class="CarbideFlame__glyph CarbideFlame__star"
        d="M 736 524 L 777 525 L 774 576 L 780 575 L 818 555 L 822 555 L 838 590 L 836 594 L 788 609 L 788 612 L 820 648 L 820 651 L 791 674 L 788 674 L 757 630 L 755 630 L 724 674 L 721 674 L 692 651 L 692 648 L 723 614 L 724 609 L 676 594 L 674 590 L 691 555 L 694 555 L 738 577 L 735 535 Z"
      />
    </g>
  {/key}
</svg>

<style>
  .CarbideFlame {
    cursor: pointer;
    user-select: none;
    -webkit-user-select: none;
    overflow: visible;
  }

  .CarbideFlame__flame {
    transform-box: fill-box;
    transform-origin: center bottom;
    animation: carbide-flame-flicker 2.8s ease-in-out infinite;
  }

  .CarbideFlame {
    animation: carbide-flame-glow 2.3s ease-in-out infinite;
  }

  .CarbideFlame__body {
    transform-box: fill-box;
    transform-origin: center bottom;
    animation: carbide-flame-lick 1.1s ease-in-out infinite;
  }

  .CarbideFlame__flame--flare {
    animation: carbide-flame-flare 600ms ease-out;
  }

  .CarbideFlame__glyph {
    fill: #182e4c;
  }

  .CarbideFlame__star {
    transform-box: fill-box;
    transform-origin: center;
    animation: carbide-flame-twinkle 2.8s ease-in-out infinite;
  }

  @keyframes carbide-flame-flicker {
    0%,
    100% {
      transform: skewX(0deg) rotate(0deg);
    }
    22% {
      transform: skewX(-1.4deg) rotate(-0.8deg);
    }
    41% {
      transform: skewX(1deg) rotate(0.7deg);
    }
    58% {
      transform: skewX(-0.8deg) rotate(-0.4deg);
    }
    80% {
      transform: skewX(1.2deg) rotate(0.5deg);
    }
  }

  @keyframes carbide-flame-lick {
    0%,
    100% {
      transform: scale(1, 1);
    }
    30% {
      transform: scale(0.985, 1.035);
    }
    55% {
      transform: scale(1.015, 0.975);
    }
    76% {
      transform: scale(0.995, 1.02);
    }
  }

  @keyframes carbide-flame-glow {
    0%,
    100% {
      filter: drop-shadow(0 0 6px rgba(90, 156, 246, 0.35));
    }
    50% {
      filter: drop-shadow(0 0 14px rgba(39, 225, 245, 0.55));
    }
  }

  @keyframes carbide-flame-flare {
    0%,
    100% {
      transform: scale(1, 1);
    }
    30% {
      transform: scale(1.05, 1.14);
    }
    60% {
      transform: scale(0.98, 0.95);
    }
  }

  @keyframes carbide-flame-twinkle {
    0%,
    38%,
    62%,
    100% {
      transform: scale(1) rotate(0deg);
      opacity: 1;
    }
    50% {
      transform: scale(0.75) rotate(22deg);
      opacity: 0.55;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .CarbideFlame,
    .CarbideFlame__flame,
    .CarbideFlame__body,
    .CarbideFlame__star {
      animation: none;
    }
  }
</style>
