import type { AppContext } from "$lib/app/di/create_app_context";
import type { Component } from "svelte";
import {
  clear_mock_app_context,
  set_mock_app_context,
} from "./mock_app_context";
import { flushSync, mount, unmount } from "./svelte_client_runtime";

export function render_with_app_context<Props extends object>(
  component: Component<Props>,
  options: {
    app_context: Partial<AppContext>;
    props?: Props;
  },
) {
  const target = document.createElement("div");
  document.body.appendChild(target);
  set_mock_app_context(options.app_context);

  const app = mount(component, {
    target,
    props: options.props ?? ({} as Props),
  });

  flushSync();

  return {
    target,
    app,
    cleanup() {
      unmount(app);
      clear_mock_app_context();
      target.remove();
      flushSync();
    },
  };
}
