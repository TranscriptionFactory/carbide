import type { SmartBlockContext } from "../ports";

const RERUN_DEBOUNCE_MS = 150;

export type ReactiveBlock = {
  schedule(): void;
  destroy(): void;
};

export function create_reactive_block(
  ctx: SmartBlockContext,
  run: (is_current: () => boolean) => Promise<void>,
  debounce_ms = RERUN_DEBOUNCE_MS,
): ReactiveBlock {
  let debounce_timer: ReturnType<typeof setTimeout> | undefined;
  let latest_token = 0;

  function schedule(): void {
    clearTimeout(debounce_timer);
    debounce_timer = setTimeout(() => {
      const token = ++latest_token;
      void run(() => token === latest_token);
    }, debounce_ms);
  }

  const unsubscribe = ctx.subscribe_to_changes(() => {
    schedule();
  });
  schedule();

  return {
    schedule,
    destroy() {
      clearTimeout(debounce_timer);
      latest_token++;
      unsubscribe();
    },
  };
}
