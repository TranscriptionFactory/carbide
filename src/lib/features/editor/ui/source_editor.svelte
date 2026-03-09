<script lang="ts">
  import OptionalSurface from "$lib/shared/ui/optional_surface.svelte";
  import type { CursorInfo } from "$lib/shared/types/editor";
  import type { OutlineHeading } from "$lib/features/outline";

  type SourceEditorProps = {
    initial_markdown: string;
    initial_cursor_offset?: number;
    initial_scroll_fraction?: number;
    on_markdown_change: (markdown: string) => void;
    on_dirty_change: (is_dirty: boolean) => void;
    on_cursor_change: (info: CursorInfo) => void;
    on_outline_change?: (headings: OutlineHeading[]) => void;
    on_destroy?: (state: {
      cursor_offset: number;
      scroll_fraction: number;
    }) => void;
  };

  let component_props: SourceEditorProps = $props();

  const load_source_editor = () =>
    import("$lib/features/editor/ui/source_editor_content.svelte");
</script>

<OptionalSurface
  loader={load_source_editor}
  {component_props}
  loading_label="Loading editor…"
  error_label="Failed to load editor"
/>
