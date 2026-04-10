<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import DownloadIcon from "@lucide/svelte/icons/download";
  import Trash2Icon from "@lucide/svelte/icons/trash-2";
  import CheckIcon from "@lucide/svelte/icons/check";
  import LoaderIcon from "@lucide/svelte/icons/loader";
  import StarIcon from "@lucide/svelte/icons/star";
  import XIcon from "@lucide/svelte/icons/x";
  import type {
    ModelInfo,
    DownloadProgress,
  } from "$lib/features/stt/types/stt_types";

  type Props = {
    models: ModelInfo[];
    active_model_id: string | null;
    model_loading: boolean;
    download_progress: DownloadProgress | null;
    on_download: (model_id: string) => void;
    on_delete: (model_id: string) => void;
    on_select: (model_id: string) => void;
    on_remove_custom: (model_id: string) => void;
  };

  let {
    models,
    active_model_id,
    model_loading,
    download_progress,
    on_download,
    on_delete,
    on_select,
    on_remove_custom,
  }: Props = $props();

  const engine_labels: Record<string, string> = {
    Parakeet: "Parakeet",
    Moonshine: "Moonshine",
    MoonshineStreaming: "Moonshine (Streaming)",
    SenseVoice: "SenseVoice",
    GigaAM: "GigaAM",
    Canary: "Canary",
  };

  const custom_models = $derived(models.filter((m) => m.is_custom));
  const catalog_models = $derived(models.filter((m) => !m.is_custom));

  const grouped_models = $derived.by(() => {
    const groups = new Map<string, ModelInfo[]>();
    for (const model of catalog_models) {
      const key = model.engine_type;
      const group = groups.get(key);
      if (group) {
        group.push(model);
      } else {
        groups.set(key, [model]);
      }
    }
    return groups;
  });

  function format_size(size_mb: number): string {
    if (size_mb >= 1024) {
      return `${(size_mb / 1024).toFixed(1)} GB`;
    }
    return `${String(size_mb)} MB`;
  }

  function score_bar(score: number): string {
    const filled = Math.round(score * 5);
    return "█".repeat(filled) + "░".repeat(5 - filled);
  }
</script>

<div class="SttModelPicker">
  {#if custom_models.length > 0}
    <div class="SttModelPicker__group">
      <h4 class="SttModelPicker__group-title">Custom</h4>

      {#each custom_models as model (model.id)}
        {@const is_active = model.id === active_model_id}

        <div
          class="SttModelPicker__model"
          class:SttModelPicker__model--active={is_active}
        >
          <div class="SttModelPicker__model-info">
            <div class="SttModelPicker__model-header">
              <span class="SttModelPicker__model-name">{model.name}</span>
              <span class="SttModelPicker__model-size">
                {engine_labels[model.engine_type] ?? model.engine_type}
              </span>
            </div>
            <span class="SttModelPicker__langs SttModelPicker__custom-path">
              {model.filename}
            </span>
          </div>

          <div class="SttModelPicker__model-actions">
            {#if !is_active}
              <Button
                variant="outline"
                size="sm"
                onclick={() => on_select(model.id)}
                disabled={model_loading}
              >
                Use
              </Button>
            {:else}
              <span class="SttModelPicker__active-badge">
                <CheckIcon />
                Active
              </span>
            {/if}
            <Button
              variant="ghost"
              size="sm"
              onclick={() => on_remove_custom(model.id)}
            >
              <XIcon />
            </Button>
          </div>
        </div>
      {/each}
    </div>
  {/if}

  {#each grouped_models as [engine_type, group_models] (engine_type)}
    <div class="SttModelPicker__group">
      <h4 class="SttModelPicker__group-title">
        {engine_labels[engine_type] ?? engine_type}
      </h4>

      {#each group_models as model (model.id)}
        {@const is_active = model.id === active_model_id}
        {@const is_downloading = model.is_downloading}
        {@const progress =
          download_progress?.model_id === model.id ? download_progress : null}

        <div
          class="SttModelPicker__model"
          class:SttModelPicker__model--active={is_active}
        >
          <div class="SttModelPicker__model-info">
            <div class="SttModelPicker__model-header">
              <span class="SttModelPicker__model-name">
                {model.name}
                {#if model.is_recommended}
                  <StarIcon class="SttModelPicker__star" />
                {/if}
              </span>
              <span class="SttModelPicker__model-size">
                {format_size(model.size_mb)}
              </span>
            </div>

            <div class="SttModelPicker__model-scores">
              <span class="SttModelPicker__score" title="Accuracy">
                Acc {score_bar(model.accuracy_score)}
              </span>
              <span class="SttModelPicker__score" title="Speed">
                Spd {score_bar(model.speed_score)}
              </span>
            </div>

            {#if model.supported_languages.length > 0 && model.supported_languages.length <= 5}
              <span class="SttModelPicker__langs">
                {model.supported_languages.join(", ")}
              </span>
            {:else if model.supported_languages.length > 5}
              <span class="SttModelPicker__langs">
                {model.supported_languages.length} languages
              </span>
            {/if}

            {#if is_downloading && progress}
              <div class="SttModelPicker__progress">
                <div
                  class="SttModelPicker__progress-bar"
                  style="width: {String(progress.percentage)}%"
                ></div>
              </div>
              <span class="SttModelPicker__progress-text">
                {String(progress.percentage)}%
              </span>
            {/if}
          </div>

          <div class="SttModelPicker__model-actions">
            {#if !model.is_downloaded && !is_downloading}
              <Button
                variant="outline"
                size="sm"
                onclick={() => on_download(model.id)}
              >
                <DownloadIcon />
                Download
              </Button>
            {:else if is_downloading}
              <Button variant="outline" size="sm" disabled>
                <LoaderIcon class="animate-spin" />
              </Button>
            {:else if model.is_downloaded && !is_active}
              <Button
                variant="outline"
                size="sm"
                onclick={() => on_select(model.id)}
                disabled={model_loading}
              >
                {#if model_loading && active_model_id === model.id}
                  <LoaderIcon class="animate-spin" />
                {:else}
                  Use
                {/if}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onclick={() => on_delete(model.id)}
              >
                <Trash2Icon />
              </Button>
            {:else if is_active}
              <span class="SttModelPicker__active-badge">
                <CheckIcon />
                Active
              </span>
              <Button
                variant="ghost"
                size="sm"
                onclick={() => on_delete(model.id)}
              >
                <Trash2Icon />
              </Button>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/each}
</div>

<style>
  .SttModelPicker {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .SttModelPicker__group-title {
    font-size: var(--text-xs);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--muted-foreground);
    margin-bottom: var(--space-2);
  }

  .SttModelPicker__model {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--border);
    background: var(--card);
  }

  .SttModelPicker__model--active {
    border-color: var(--primary);
    background: color-mix(in srgb, var(--primary) 5%, var(--card));
  }

  .SttModelPicker__model-info {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-width: 0;
    flex: 1;
  }

  .SttModelPicker__model-header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .SttModelPicker__model-name {
    font-size: var(--text-sm);
    font-weight: 500;
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }

  .SttModelPicker__model-name :global(.SttModelPicker__star) {
    width: 12px;
    height: 12px;
    color: var(--warning, #f59e0b);
  }

  .SttModelPicker__model-size {
    font-size: var(--text-xs);
    color: var(--muted-foreground);
  }

  .SttModelPicker__model-scores {
    display: flex;
    gap: var(--space-3);
    font-size: 10px;
    font-family: var(--font-mono);
    color: var(--muted-foreground);
  }

  .SttModelPicker__langs {
    font-size: var(--text-xs);
    color: var(--muted-foreground);
  }

  .SttModelPicker__progress {
    height: 4px;
    background: var(--muted);
    border-radius: 2px;
    overflow: hidden;
    margin-top: var(--space-1);
  }

  .SttModelPicker__progress-bar {
    height: 100%;
    background: var(--primary);
    transition: width 0.2s ease;
  }

  .SttModelPicker__progress-text {
    font-size: var(--text-xs);
    color: var(--muted-foreground);
  }

  .SttModelPicker__model-actions {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    flex-shrink: 0;
  }

  .SttModelPicker__active-badge {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    font-size: var(--text-xs);
    color: var(--primary);
    font-weight: 500;
  }

  .SttModelPicker__custom-path {
    font-family: var(--font-mono);
    font-size: 10px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .SttModelPicker__active-badge :global(svg) {
    width: 14px;
    height: 14px;
  }
</style>
