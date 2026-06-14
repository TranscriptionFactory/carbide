import type { SmartBlockHandler, SmartBlockRegistry } from "../ports";

export function create_smart_block_registry(): SmartBlockRegistry {
  const handlers = new Map<string, SmartBlockHandler>();

  return {
    register(handler) {
      handlers.set(handler.type, handler);
    },
    get(type) {
      return handlers.get(type);
    },
    has(type) {
      return handlers.has(type);
    },
  };
}
