import type { Component } from "svelte";

type MountedComponent = Record<string, unknown>;

// @ts-expect-error jsdom component tests need Svelte's browser runtime entry.
import * as raw_svelte_client from "../../../node_modules/svelte/src/index-client.js";

const svelte_client = raw_svelte_client as unknown as {
  flushSync: () => void;
  mount: <Props extends object>(
    component: Component<Props>,
    options: {
      target: Document | Element | ShadowRoot;
      props?: Props;
    },
  ) => MountedComponent;
  unmount: (component: MountedComponent) => void;
};

export const flushSync = svelte_client.flushSync;
export const mount = svelte_client.mount;
export const unmount = svelte_client.unmount;
