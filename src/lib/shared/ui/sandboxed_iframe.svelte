<script lang="ts">
  interface Props {
    src: string;
    origin: string;
    title: string;
    csp?: string;
    sandbox?: string;
    class?: string;
    on_message: (data: unknown) => void;
  }

  let {
    src,
    origin,
    title,
    csp = "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; connect-src none;",
    sandbox = "allow-scripts",
    class: class_name = "",
    on_message,
  }: Props = $props();

  let iframe_element: HTMLIFrameElement | null = $state(null);

  $effect(() => {
    const handle_message = (event: MessageEvent) => {
      if (event.origin !== origin) return;
      if (event.source !== iframe_element?.contentWindow) return;
      on_message(event.data);
    };

    window.addEventListener("message", handle_message);

    return () => {
      window.removeEventListener("message", handle_message);
    };
  });

  export function post_message(message: unknown) {
    iframe_element?.contentWindow?.postMessage(message, origin);
  }

  export function get_iframe(): HTMLIFrameElement | null {
    return iframe_element;
  }
</script>

<iframe
  bind:this={iframe_element}
  {src}
  {title}
  {sandbox}
  {...{ csp } as any}
  class={class_name}
  aria-hidden="true"
></iframe>
