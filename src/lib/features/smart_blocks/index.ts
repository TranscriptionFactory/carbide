export { create_smart_block_registry } from "./domain/smart_block_registry";
export { parse_smart_block } from "./domain/smart_block_spec";
export { suggest_base_spec } from "./domain/base_view_suggestions";
export {
  smart_block_body,
  type SmartBlockScaffoldType,
} from "./domain/smart_block_scaffold";
export { create_tasks_smart_block_handler } from "./ui/handlers/tasks_smart_block";
export type { TaskQueryCallbacks } from "./ui/handlers/tasks_smart_block";
export { create_query_smart_block_handler } from "./ui/handlers/query_smart_block";
export type { QuerySmartBlockDeps } from "./ui/handlers/query_smart_block";
export { create_backlinks_smart_block_handler } from "./ui/handlers/backlinks_smart_block";
export type { BacklinksSmartBlockDeps } from "./ui/handlers/backlinks_smart_block";
export { create_base_smart_block_handler } from "./ui/handlers/base_smart_block";
export type {
  BaseSmartBlockDeps,
  BaseQueryOutcome,
} from "./ui/handlers/base_smart_block";
export type { QueryResult } from "$lib/features/query";
export type { NoteLinksSnapshot } from "$lib/features/search";
export type {
  SmartBlockSpec,
  SmartBlockContext,
  SmartBlockInstance,
  SmartBlockHandler,
  SmartBlockRegistry,
} from "./ports";
