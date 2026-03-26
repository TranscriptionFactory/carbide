<script lang="ts">
  type Props = {
    interactive?: boolean;
    on_element_click?: (role: string, anchor: HTMLElement) => void;
  };

  let { interactive = false, on_element_click }: Props = $props();

  function handle_click(e: MouseEvent) {
    if (!interactive || !on_element_click) return;
    const target = (e.target as HTMLElement).closest<HTMLElement>(
      "[data-theme-role]",
    );
    if (target) {
      on_element_click(target.dataset.themeRole ?? "", target);
    }
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex a11y_no_static_element_interactions a11y_click_events_have_key_events -->
<div
  class="ThemePreview"
  class:ThemePreview--interactive={interactive}
  onclick={handle_click}
  onkeydown={(e) =>
    e.key === "Enter" && handle_click(e as unknown as MouseEvent)}
  role={interactive ? "button" : undefined}
  tabindex={interactive ? 0 : undefined}
>
  <h1 data-theme-role="heading">A Heading</h1>
  <p data-theme-role="editor_text">
    This is body text with <strong data-theme-role="bold">bold emphasis</strong>
    and <em data-theme-role="italic">italic emphasis</em>. Here is a
    <a
      href="#preview"
      data-theme-role="link"
      onclick={(e) => e.preventDefault()}>link to somewhere</a
    >.
  </p>
  <blockquote data-theme-role="blockquote">
    <p data-theme-role="blockquote_text">
      A blockquote — for notes, context, or reflection.
    </p>
  </blockquote>
  <p data-theme-role="editor_text">
    Use <code data-theme-role="inline_code">inline code</code> for short references.
  </p>
  <pre data-theme-role="code_block"><code data-theme-role="code_block_text"
      >function greet(name: string) &#123;
  return `Hello, $&#123;name&#125;!`;
&#125;</code
    ></pre>
  <p data-theme-role="editor_text">
    And <mark data-theme-role="highlight">highlighted text</mark> for what matters
    most.
  </p>
</div>

<style>
  .ThemePreview {
    font-family: var(--font-family-sans, system-ui, sans-serif);
    font-size: var(--editor-font-size, 1rem);
    line-height: var(--editor-line-height, 1.75);
    color: var(--editor-text, var(--foreground));
    background: var(--background);
    border: 1px solid var(--border);
    border-radius: var(--radius, 0.5rem);
    padding: var(--space-5, 1.25rem);
    overflow: hidden;
  }

  .ThemePreview--interactive [data-theme-role] {
    cursor: pointer;
    transition: outline-offset 100ms ease;
    border-radius: 2px;
  }

  .ThemePreview--interactive [data-theme-role]:hover {
    outline: 2px solid var(--ring, oklch(0.6 0.15 250));
    outline-offset: 2px;
  }

  .ThemePreview h1 {
    font-size: 1.5em;
    font-weight: var(--editor-heading-weight, 600);
    color: var(--editor-heading-color, var(--foreground));
    margin: 0 0 0.5em;
    line-height: 1.3;
  }

  .ThemePreview p {
    margin: 0 0 0.75em;
  }

  .ThemePreview strong {
    font-weight: var(--editor-bold-weight, 600);
    color: var(--editor-bold-color, inherit);
  }

  .ThemePreview em {
    color: var(--editor-italic-color, inherit);
  }

  .ThemePreview a {
    color: var(--editor-link, var(--primary));
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .ThemePreview blockquote {
    border-left: 3px solid var(--editor-blockquote-border, var(--border));
    background: var(--editor-blockquote-bg, var(--muted));
    padding: var(--space-3, 0.75rem) var(--space-4, 1rem);
    margin: 0 0 0.75em;
    border-radius: 0 var(--radius-sm, 0.25rem) var(--radius-sm, 0.25rem) 0;
  }

  .ThemePreview blockquote p {
    margin: 0;
    color: var(--editor-blockquote-text, var(--muted-foreground));
  }

  .ThemePreview code {
    font-family: var(--font-family-mono, ui-monospace, monospace);
    font-size: 0.875em;
    background: var(--editor-code-inline-bg, var(--muted));
    color: var(--editor-code-inline-text, var(--foreground));
    padding: 0.125em 0.375em;
    border-radius: var(--radius-sm, 0.25rem);
  }

  .ThemePreview pre {
    background: var(--editor-code-bg, var(--muted));
    border: 1px solid var(--editor-code-border, var(--border));
    border-radius: var(--radius-sm, 0.25rem);
    padding: var(--space-3, 0.75rem) var(--space-4, 1rem);
    margin: 0 0 0.75em;
    overflow-x: auto;
  }

  .ThemePreview pre code {
    background: transparent;
    padding: 0;
    color: var(--editor-code-block-text, var(--foreground));
    font-size: 0.8125em;
  }

  .ThemePreview mark {
    background: var(--editor-mark-bg, oklch(0.88 0.1 80));
    color: var(--editor-mark-text, inherit);
    padding: 0.05em 0.25em;
    border-radius: 2px;
  }
</style>
