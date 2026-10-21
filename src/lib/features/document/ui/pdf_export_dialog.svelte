<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import * as Select from "$lib/components/ui/select/index.js";
  import * as Switch from "$lib/components/ui/switch/index.js";
  import { Button } from "$lib/components/ui/button";
  import { Slider } from "$lib/components/ui/slider";
  import {
    PDF_DOWNSCALE_MAX,
    PDF_DOWNSCALE_MIN,
    PDF_MARGINS,
    PDF_PAGE_SIZES,
    type PdfExportOptions,
    type PdfMargin,
    type PdfPageSize,
  } from "$lib/shared/types/pdf_export";

  interface Props {
    open: boolean;
    options: PdfExportOptions;
    on_update: (options: PdfExportOptions) => void;
    on_confirm: () => void;
    on_cancel: () => void;
  }

  let { open, options, on_update, on_confirm, on_cancel }: Props = $props();

  const page_size_options = Object.entries(PDF_PAGE_SIZES).map(
    ([value, { label }]) => ({ value: value as PdfPageSize, label }),
  );
  const margin_options = Object.entries(PDF_MARGINS).map(
    ([value, { label }]) => ({ value: value as PdfMargin, label }),
  );

  function update<K extends keyof PdfExportOptions>(
    key: K,
    value: PdfExportOptions[K],
  ) {
    on_update({ ...options, [key]: value });
  }
</script>

<Dialog.Root
  {open}
  onOpenChange={(value: boolean) => {
    if (!value) on_cancel();
  }}
>
  <Dialog.Content class="max-w-sm">
    <Dialog.Header>
      <Dialog.Title>Export to PDF</Dialog.Title>
    </Dialog.Header>

    <div class="space-y-4">
      <label class="flex items-center justify-between gap-4 text-sm">
        Include file name as title
        <Switch.Root
          checked={options.include_title}
          onCheckedChange={(v: boolean) => update("include_title", v)}
        />
      </label>

      <div class="flex items-center justify-between gap-4 text-sm">
        Page size
        <Select.Root
          type="single"
          value={options.page_size}
          onValueChange={(v: string | undefined) => {
            if (v) update("page_size", v as PdfPageSize);
          }}
        >
          <Select.Trigger class="w-32">
            <span data-slot="select-value">
              {PDF_PAGE_SIZES[options.page_size].label}
            </span>
          </Select.Trigger>
          <Select.Content>
            {#each page_size_options as opt (opt.value)}
              <Select.Item value={opt.value}>{opt.label}</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
      </div>

      <label class="flex items-center justify-between gap-4 text-sm">
        Landscape
        <Switch.Root
          checked={options.landscape}
          onCheckedChange={(v: boolean) => update("landscape", v)}
        />
      </label>

      <div class="flex items-center justify-between gap-4 text-sm">
        Margin
        <Select.Root
          type="single"
          value={options.margin}
          onValueChange={(v: string | undefined) => {
            if (v) update("margin", v as PdfMargin);
          }}
        >
          <Select.Trigger class="w-32">
            <span data-slot="select-value">
              {PDF_MARGINS[options.margin].label}
            </span>
          </Select.Trigger>
          <Select.Content>
            {#each margin_options as opt (opt.value)}
              <Select.Item value={opt.value}>{opt.label}</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
      </div>

      <div class="flex items-center justify-between gap-4 text-sm">
        Downscale percent
        <div class="flex w-40 items-center gap-3">
          <Slider
            type="single"
            value={options.downscale_percent}
            onValueChange={(v: number | undefined) => {
              if (v !== undefined) update("downscale_percent", v);
            }}
            min={PDF_DOWNSCALE_MIN}
            max={PDF_DOWNSCALE_MAX}
            step={5}
          />
          <span class="w-10 text-right tabular-nums text-muted-foreground">
            {options.downscale_percent}%
          </span>
        </div>
      </div>
    </div>

    <Dialog.Footer>
      <Button variant="outline" onclick={on_cancel}>Cancel</Button>
      <Button variant="default" onclick={on_confirm}>Export</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
