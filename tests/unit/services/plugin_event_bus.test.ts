import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PluginEventBus } from "$lib/features/plugin/application/plugin_event_bus";
import type { PluginEvent } from "$lib/features/plugin/application/plugin_event_bus";
import type { PluginEventType } from "$lib/features/plugin/ports";

const FILE_CREATED: PluginEventType = "file-created";
const FILE_MODIFIED: PluginEventType = "file-modified";
const METADATA_CHANGED: PluginEventType = "metadata-changed";

function make_event(
  type: PluginEventType = FILE_CREATED,
  data?: unknown,
): PluginEvent {
  return { type, data, timestamp: Date.now() };
}

describe("PluginEventBus", () => {
  let bus: PluginEventBus;

  beforeEach(() => {
    vi.useFakeTimers();
    bus = new PluginEventBus();
  });

  afterEach(() => {
    bus.destroy();
    vi.useRealTimers();
  });

  describe("subscribe / unsubscribe", () => {
    it("subscribe adds a subscription", () => {
      bus.subscribe("plugin-a", FILE_CREATED, "cb-1");
      expect(bus.get_subscription_count("plugin-a")).toBe(1);
    });

    it("subscribing with the same callback_id is idempotent", () => {
      bus.subscribe("plugin-a", FILE_CREATED, "cb-1");
      bus.subscribe("plugin-a", FILE_CREATED, "cb-1");
      expect(bus.get_subscription_count("plugin-a")).toBe(1);
    });

    it("multiple distinct subscriptions are tracked separately", () => {
      bus.subscribe("plugin-a", FILE_CREATED, "cb-1");
      bus.subscribe("plugin-a", FILE_MODIFIED, "cb-2");
      expect(bus.get_subscription_count("plugin-a")).toBe(2);
    });

    it("unsubscribe removes the matching subscription", () => {
      bus.subscribe("plugin-a", FILE_CREATED, "cb-1");
      bus.subscribe("plugin-a", FILE_MODIFIED, "cb-2");
      bus.unsubscribe("plugin-a", "cb-1");
      expect(bus.get_subscription_count("plugin-a")).toBe(1);
    });

    it("unsubscribe removes plugin entry when last subscription is removed", () => {
      bus.subscribe("plugin-a", FILE_CREATED, "cb-1");
      bus.unsubscribe("plugin-a", "cb-1");
      expect(bus.get_subscription_count("plugin-a")).toBe(0);
    });

    it("unsubscribe on unknown plugin_id is safe", () => {
      expect(() => bus.unsubscribe("unknown", "cb-1")).not.toThrow();
    });
  });

  describe("unsubscribe_all", () => {
    it("removes all subscriptions for a plugin", () => {
      bus.subscribe("plugin-a", FILE_CREATED, "cb-1");
      bus.subscribe("plugin-a", FILE_MODIFIED, "cb-2");
      bus.unsubscribe_all("plugin-a");
      expect(bus.get_subscription_count("plugin-a")).toBe(0);
    });

    it("does not affect subscriptions for other plugins", () => {
      bus.subscribe("plugin-a", FILE_CREATED, "cb-1");
      bus.subscribe("plugin-b", FILE_CREATED, "cb-2");
      bus.unsubscribe_all("plugin-a");
      expect(bus.get_subscription_count("plugin-b")).toBe(1);
    });
  });

  describe("emit and event delivery", () => {
    it("delivers events to matching subscribers after debounce", () => {
      const listener = vi.fn();
      bus.set_event_listener(listener);
      bus.subscribe("plugin-a", FILE_CREATED, "cb-1");

      bus.emit(make_event(FILE_CREATED));
      expect(listener).not.toHaveBeenCalled();

      vi.advanceTimersByTime(100);
      expect(listener).toHaveBeenCalledOnce();
      expect(listener.mock.calls[0]?.[0]).toBe("plugin-a");
      expect(listener.mock.calls[0]?.[1].type).toBe(FILE_CREATED);
    });

    it("does not deliver events for non-matching event types", () => {
      const listener = vi.fn();
      bus.set_event_listener(listener);
      bus.subscribe("plugin-a", FILE_CREATED, "cb-1");

      bus.emit(make_event(FILE_MODIFIED));
      vi.advanceTimersByTime(100);

      expect(listener).not.toHaveBeenCalled();
    });

    it("delivers to multiple plugins subscribed to the same event", () => {
      const listener = vi.fn();
      bus.set_event_listener(listener);
      bus.subscribe("plugin-a", FILE_CREATED, "cb-1");
      bus.subscribe("plugin-b", FILE_CREATED, "cb-2");

      bus.emit(make_event(FILE_CREATED));
      vi.advanceTimersByTime(100);

      const plugin_ids = listener.mock.calls.map((c) => c[0]);
      expect(plugin_ids).toContain("plugin-a");
      expect(plugin_ids).toContain("plugin-b");
    });
  });

  describe("permission checker", () => {
    it("skips delivery for plugins that fail the permission check", () => {
      const listener = vi.fn();
      bus.set_event_listener(listener);
      bus.set_permission_checker((id) => id === "plugin-b");
      bus.subscribe("plugin-a", FILE_CREATED, "cb-1");
      bus.subscribe("plugin-b", FILE_CREATED, "cb-2");

      bus.emit(make_event(FILE_CREATED));
      vi.advanceTimersByTime(100);

      const plugin_ids = listener.mock.calls.map((c) => c[0]);
      expect(plugin_ids).not.toContain("plugin-a");
      expect(plugin_ids).toContain("plugin-b");
    });

    it("delivers to all plugins when no permission checker is set", () => {
      const listener = vi.fn();
      bus.set_event_listener(listener);
      bus.subscribe("plugin-a", FILE_CREATED, "cb-1");

      bus.emit(make_event(FILE_CREATED));
      vi.advanceTimersByTime(100);

      expect(listener).toHaveBeenCalledOnce();
    });
  });

  describe("backpressure", () => {
    it("drops the oldest event when queue exceeds MAX_PENDING (64)", () => {
      const listener = vi.fn();
      bus.set_event_listener(listener);
      bus.subscribe("plugin-a", FILE_CREATED, "cb-1");

      for (let i = 0; i < 65; i++) {
        bus.emit({ type: FILE_CREATED, data: i, timestamp: i });
      }

      vi.advanceTimersByTime(100);

      expect(listener).toHaveBeenCalledTimes(64);
      const delivered_data = listener.mock.calls.map(
        (c) => (c[1] as PluginEvent).data,
      );
      expect(delivered_data).not.toContain(0);
      expect(delivered_data).toContain(64);
    });
  });

  describe("debounce batching", () => {
    it("batches multiple rapid emits into a single flush", () => {
      const listener = vi.fn();
      bus.set_event_listener(listener);
      bus.subscribe("plugin-a", FILE_CREATED, "cb-1");

      bus.emit(make_event(FILE_CREATED));
      bus.emit(make_event(FILE_CREATED));
      bus.emit(make_event(FILE_CREATED));

      expect(listener).not.toHaveBeenCalled();

      vi.advanceTimersByTime(100);

      expect(listener).toHaveBeenCalledTimes(3);
    });

    it("resets the debounce timer on each new event", () => {
      const listener = vi.fn();
      bus.set_event_listener(listener);
      bus.subscribe("plugin-a", FILE_CREATED, "cb-1");

      bus.emit(make_event(FILE_CREATED));
      vi.advanceTimersByTime(30);
      bus.emit(make_event(FILE_CREATED));
      vi.advanceTimersByTime(30);

      expect(listener).not.toHaveBeenCalled();

      vi.advanceTimersByTime(50);
      expect(listener).toHaveBeenCalledTimes(2);
    });
  });

  describe("metadata-changed events", () => {
    it("delivers metadata-changed events with payload to subscribed plugins", () => {
      const listener = vi.fn();
      bus.set_event_listener(listener);
      bus.subscribe("plugin-a", METADATA_CHANGED, "cb-meta");

      const payload = {
        event_type: "upsert",
        path: "notes/test.md",
      };
      bus.emit(make_event(METADATA_CHANGED, payload));
      vi.advanceTimersByTime(100);

      expect(listener).toHaveBeenCalledOnce();
      expect(listener.mock.calls[0]?.[1].type).toBe("metadata-changed");
      expect(listener.mock.calls[0]?.[1].data).toEqual(payload);
    });

    it("does not deliver metadata-changed to plugins subscribed to other events only", () => {
      const listener = vi.fn();
      bus.set_event_listener(listener);
      bus.subscribe("plugin-a", FILE_CREATED, "cb-file");

      bus.emit(
        make_event(METADATA_CHANGED, { event_type: "delete", path: "x.md" }),
      );
      vi.advanceTimersByTime(100);

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe("get_subscription_count", () => {
    it("returns 0 for a plugin with no subscriptions", () => {
      expect(bus.get_subscription_count("plugin-x")).toBe(0);
    });

    it("returns correct count after mixed subscribe/unsubscribe", () => {
      bus.subscribe("plugin-a", FILE_CREATED, "cb-1");
      bus.subscribe("plugin-a", FILE_MODIFIED, "cb-2");
      bus.unsubscribe("plugin-a", "cb-1");
      expect(bus.get_subscription_count("plugin-a")).toBe(1);
    });
  });

  describe("destroy", () => {
    it("clears all subscriptions", () => {
      bus.subscribe("plugin-a", FILE_CREATED, "cb-1");
      bus.subscribe("plugin-b", FILE_CREATED, "cb-2");
      bus.destroy();
      expect(bus.get_subscription_count("plugin-a")).toBe(0);
      expect(bus.get_subscription_count("plugin-b")).toBe(0);
    });

    it("stops event delivery after destroy", () => {
      const listener = vi.fn();
      bus.set_event_listener(listener);
      bus.subscribe("plugin-a", FILE_CREATED, "cb-1");

      bus.emit(make_event(FILE_CREATED));
      bus.destroy();
      vi.advanceTimersByTime(100);

      expect(listener).not.toHaveBeenCalled();
    });
  });
});
