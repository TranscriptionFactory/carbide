import type { PluginEventType } from "../ports";

export interface PluginEvent {
  type: PluginEventType;
  data?: unknown;
  timestamp: number;
}

interface PluginEventSubscription {
  callback_id: string;
  event_type: PluginEventType;
}

const MAX_PENDING_EVENTS = 64;
const DEBOUNCE_MS = 50;

export class PluginEventBus {
  private subscriptions = new Map<string, PluginEventSubscription[]>();
  private pending_queues = new Map<string, PluginEvent[]>();
  private debounce_timers = new Map<string, ReturnType<typeof setTimeout>>();
  private event_listener:
    | ((plugin_id: string, event: PluginEvent) => void)
    | null = null;
  private permission_checker: ((plugin_id: string) => boolean) | null = null;

  set_event_listener(
    listener: (plugin_id: string, event: PluginEvent) => void,
  ) {
    this.event_listener = listener;
  }

  set_permission_checker(checker: (plugin_id: string) => boolean) {
    this.permission_checker = checker;
  }

  subscribe(
    plugin_id: string,
    event_type: PluginEventType,
    callback_id: string,
  ) {
    const subs = this.subscriptions.get(plugin_id) ?? [];
    if (subs.some((s) => s.callback_id === callback_id)) return;
    subs.push({ callback_id, event_type });
    this.subscriptions.set(plugin_id, subs);
  }

  unsubscribe(plugin_id: string, callback_id: string) {
    const subs = this.subscriptions.get(plugin_id);
    if (!subs) return;
    const filtered = subs.filter((s) => s.callback_id !== callback_id);
    if (filtered.length === 0) {
      this.subscriptions.delete(plugin_id);
    } else {
      this.subscriptions.set(plugin_id, filtered);
    }
  }

  unsubscribe_all(plugin_id: string) {
    this.subscriptions.delete(plugin_id);
    this.pending_queues.delete(plugin_id);
    const timer = this.debounce_timers.get(plugin_id);
    if (timer) {
      clearTimeout(timer);
      this.debounce_timers.delete(plugin_id);
    }
  }

  emit(event: PluginEvent) {
    for (const [plugin_id, subs] of this.subscriptions) {
      if (this.permission_checker && !this.permission_checker(plugin_id)) {
        continue;
      }

      const matching = subs.filter((s) => s.event_type === event.type);
      if (matching.length === 0) continue;

      this.enqueue_event(plugin_id, event);
    }
  }

  private enqueue_event(plugin_id: string, event: PluginEvent) {
    const queue = this.pending_queues.get(plugin_id) ?? [];

    if (queue.length >= MAX_PENDING_EVENTS) {
      queue.shift();
    }
    queue.push(event);
    this.pending_queues.set(plugin_id, queue);

    const existing_timer = this.debounce_timers.get(plugin_id);
    if (existing_timer) {
      clearTimeout(existing_timer);
    }

    const timer = setTimeout(() => {
      this.flush_queue(plugin_id);
      this.debounce_timers.delete(plugin_id);
    }, DEBOUNCE_MS);
    this.debounce_timers.set(plugin_id, timer);
  }

  private flush_queue(plugin_id: string) {
    const queue = this.pending_queues.get(plugin_id);
    if (!queue || queue.length === 0) return;

    for (const event of queue) {
      this.event_listener?.(plugin_id, event);
    }
    this.pending_queues.set(plugin_id, []);
  }

  get_subscription_count(plugin_id: string): number {
    return this.subscriptions.get(plugin_id)?.length ?? 0;
  }

  destroy() {
    for (const timer of this.debounce_timers.values()) {
      clearTimeout(timer);
    }
    this.subscriptions.clear();
    this.pending_queues.clear();
    this.debounce_timers.clear();
    this.event_listener = null;
    this.permission_checker = null;
  }
}
