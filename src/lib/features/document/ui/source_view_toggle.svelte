<script lang="ts">
  import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import ViewModeToggle from "$lib/features/document/ui/view_mode_toggle.svelte";
  import type { DocumentFileType } from "$lib/features/document/types/document";
  import CodeIcon from "@lucide/svelte/icons/code";
  import TableIcon from "@lucide/svelte/icons/table";
  import PenToolIcon from "@lucide/svelte/icons/pen-tool";
  import LayoutDashboardIcon from "@lucide/svelte/icons/layout-dashboard";

  interface Props {
    file_type: DocumentFileType;
    source_view: boolean;
  }

  let { file_type, source_view }: Props = $props();
  const { action_registry } = use_app_context();

  const rendered_option = $derived(
    file_type === "csv"
      ? { value: "rendered" as const, label: "Table", icon: TableIcon }
      : file_type === "excalidraw"
        ? { value: "rendered" as const, label: "Drawing", icon: PenToolIcon }
        : {
            value: "rendered" as const,
            label: "Canvas",
            icon: LayoutDashboardIcon,
          },
  );
  const options = $derived([
    { value: "source" as const, label: "Source", icon: CodeIcon },
    rendered_option,
  ]);

  function select(value: "source" | "rendered"): void {
    void action_registry.execute(
      ACTION_IDS.document_set_source_view,
      value === "source",
    );
  }
</script>

<ViewModeToggle
  aria_label="Document view mode"
  {options}
  value={source_view ? "source" : "rendered"}
  on_select={select}
/>
