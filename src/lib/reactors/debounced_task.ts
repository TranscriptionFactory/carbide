type DebouncedTaskControllerOptions<T> = {
  run: (value: T) => void;
};

export function create_debounced_task_controller<T>(
  controller_options: DebouncedTaskControllerOptions<T>,
) {
  let timer: ReturnType<typeof setTimeout> | null = null;

  function cancel() {
    if (!timer) {
      return;
    }
    clearTimeout(timer);
    timer = null;
  }

  function schedule(value: T, delay_ms: number) {
    cancel();
    timer = setTimeout(() => {
      timer = null;
      controller_options.run(value);
    }, delay_ms);
  }

  return {
    cancel,
    schedule,
  };
}
