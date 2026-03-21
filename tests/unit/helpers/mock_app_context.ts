import type { AppContext } from "$lib/app/di/create_app_context";

let current_app_context: Partial<AppContext> | null = null;

export function set_mock_app_context(value: Partial<AppContext>) {
  current_app_context = value;
}

export function clear_mock_app_context() {
  current_app_context = null;
}

export function provide_app_context(value: AppContext): void {
  current_app_context = value;
}

export function use_app_context(): AppContext {
  if (!current_app_context) {
    throw new Error("mock app context is not set");
  }

  return current_app_context as AppContext;
}
