import {
  create_app_context,
  type AppContext,
} from "$lib/app/di/create_app_context";

export type LiteAppContext = AppContext;

export function create_lite_app_context(
  input: Omit<Parameters<typeof create_app_context>[0], "app_target">,
): LiteAppContext {
  return create_app_context({
    ...input,
    app_target: "lite",
  });
}
