<script lang="ts">
  import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import ViewModeToggle from "$lib/features/document/ui/view_mode_toggle.svelte";
  import type { DocumentFileType } from "$lib/features/document/types/document";
  import CodeIcon from "@lucide/svelte/icons/code";
  import TableIcon from "@lucide/svelte/icons/table";
  import SheetIcon from "@lucide/svelte/icons/sheet";
  import PenToolIcon from "@lucide/svelte/icons/pen-tool";
  import LayoutDashboardIcon from "@lucide/svelte/icons/layout-dashboard";

  type ViewMode = "source" | "rendered" | "sheet";

  interface Props {
    file_type: DocumentFileType;
    source_view: boolean;
    sheet_edit?: boolean;
  }

  let { file_type, source_view, sheet_edit = false }: Props = $props();
  const { action_registry } = use_app_context();

  const source_option = {
    value: "source" as const,
    label: "Source",
    icon: CodeIcon,
  };
  const options = $derived(
    file_type === "csv"
      ? [
          source_option,
          { value: "rendered" as const, label: "Table", icon: TableIcon },
          { value: "sheet" as const, label: "Spreadsheet", icon: SheetIcon },
        ]
      : [
          source_option,
          file_type === "excalidraw"
            ? {
                value: "rendered" as const,
                label: "Drawing",
                icon: PenToolIcon,
              }
            : {
                value: "rendered" as const,
                label: "Canvas",
                icon: LayoutDashboardIcon,
              },
        ],
  );
  const value = $derived<ViewMode>(
    source_view ? "source" : sheet_edit ? "sheet" : "rendered",
  );

  function select(mode: ViewMode): void {
    if (mode === "source") {
      void action_registry.execute(ACTION_IDS.document_set_source_view, true);
    } else if (file_type === "csv") {
      void action_registry.execute(
        ACTION_IDS.document_set_sheet_edit,
        mode === "sheet",
      );
    } else {
      void action_registry.execute(ACTION_IDS.document_set_source_view, false);
    }
  }
</script>

<ViewModeToggle
  aria_label="Document view mode"
  {options}
  {value}
  on_select={select}
/>
