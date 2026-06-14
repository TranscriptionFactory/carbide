export { create_smart_block_registry } from "./domain/smart_block_registry";
export { parse_smart_block } from "./domain/smart_block_spec";
export { create_tasks_smart_block_handler } from "./ui/handlers/tasks_smart_block";
export type { TaskQueryCallbacks } from "./ui/handlers/tasks_smart_block";
export { create_query_smart_block_handler } from "./ui/handlers/query_smart_block";
export type { QuerySmartBlockDeps } from "./ui/handlers/query_smart_block";
export { create_backlinks_smart_block_handler } from "./ui/handlers/backlinks_smart_block";
export type { BacklinksSmartBlockDeps } from "./ui/handlers/backlinks_smart_block";
export type { QueryResult } from "$lib/features/query";
export type { NoteLinksSnapshot } from "$lib/features/search";
export type {
  SmartBlockSpec,
  SmartBlockContext,
  SmartBlockInstance,
  SmartBlockHandler,
  SmartBlockRegistry,
} from "./ports";
