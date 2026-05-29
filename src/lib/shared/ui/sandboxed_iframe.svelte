<script lang="ts">
  interface Props {
    src?: string;
    srcdoc?: string;
    origin?: string;
    title: string;
    csp?: string;
    sandbox?: string;
    class?: string;
    visible?: boolean;
    on_message?: (data: unknown) => void;
    on_load?: () => void;
  }

  let {
    src,
    srcdoc,
    origin: _origin,
    title,
    csp,
    sandbox = "allow-scripts",
    class: class_name = "",
    visible = false,
    on_message,
    on_load,
  }: Props = $props();

  let iframe_element: HTMLIFrameElement | null = $state(null);

  $effect(() => {
    if (!on_message) return;
    const handler = on_message;
    const handle_message = (event: MessageEvent) => {
      if (event.source !== iframe_element?.contentWindow) return;
      handler(event.data);
    };

    window.addEventListener("message", handle_message);

    return () => {
      window.removeEventListener("message", handle_message);
    };
  });

  export function post_message(message: unknown) {
    iframe_element?.contentWindow?.postMessage(message, "*");
  }

  export function get_iframe(): HTMLIFrameElement | null {
    return iframe_element;
  }
</script>

<iframe
  bind:this={iframe_element}
  {src}
  {srcdoc}
  {title}
  {sandbox}
  {...csp ? { csp } : {}}
  class={class_name}
  aria-hidden={!visible}
  onload={on_load}
></iframe>
