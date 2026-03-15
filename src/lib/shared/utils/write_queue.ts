export function create_write_queue() {
  const queues = new Map<string, Promise<void>>();

  return async <Result>(key: string, task: () => Promise<Result>) => {
    const previous = queues.get(key) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(task);
    const next_queue = next.then(() => undefined);
    queues.set(key, next_queue);
    const cleanup = () => {
      if (queues.get(key) === next_queue) queues.delete(key);
    };
    next_queue.then(cleanup, cleanup);
    return await next;
  };
}
