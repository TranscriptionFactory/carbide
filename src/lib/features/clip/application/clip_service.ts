import {
  ClipFetchError,
  type ClipFetchErrorKind,
  type ClipPage,
  type ClipPort,
  type FigureSnapshot,
} from "$lib/features/clip/ports";
import {
  apply_figure_snapshots,
  snapshot_url,
} from "$lib/features/clip/domain/apply_figure_snapshots";
import type { EpubImage } from "$lib/shared/types/epub";
import { epub_media_type } from "$lib/shared/domain/epub_media_type";
import {
  extract_readable_content,
  type ReadableContent,
} from "$lib/features/clip/domain/extract_readable_content";
import {
  plan_image_localization,
  rewrite_image_srcs,
  type ImageLocalizationPlan,
} from "$lib/features/clip/domain/localize_images";
import {
  build_clip_frontmatter,
  build_clip_provenance,
  clip_stem,
  type ClipFormats,
} from "$lib/features/clip/domain/clip_note";
import type { AssetsPort, NoteService, NotesStore } from "$lib/features/note";
import { to_markdown_asset_target } from "$lib/features/note";
import type { DocumentService } from "$lib/features/document";
import { uniquify_note_path } from "$lib/features/folder";
import type { VaultStore } from "$lib/features/vault";
import type { OpStore } from "$lib/app/orchestration/op_store.svelte";
import {
  get_preview_allowlist,
  html_to_markdown,
  sanitize_html,
  to_xhtml_document,
} from "$lib/shared/html";
import { map_with_concurrency } from "$lib/shared/utils/concurrent";
import {
  as_markdown_text,
  as_note_path,
  type AssetPath,
  type VaultId,
} from "$lib/shared/types/ids";

export type { ClipFormats };

export type ClipSource = "fetch" | "capture";

export type ClipRequest = {
  url: string;
  folder_path: string;
  formats: ClipFormats;
  attachment_folder: string;
  name?: string;
  source?: ClipSource;
};

export type ClipOutputKind = "markdown" | "html" | "epub";

export type ClipOutput = {
  kind: ClipOutputKind;
  path: string;
};

export type ClipResult =
  | {
      status: "clipped";
      outputs: ClipOutput[];
      primary: ClipOutput;
      images_total: number;
      images_failed: number;
      images_skipped: number;
    }
  | { status: "skipped" }
  | { status: "failed"; error: string; kind: ClipFetchErrorKind };

type LocalizedImages = {
  asset_paths: Map<string, AssetPath>;
  plan: ImageLocalizationPlan;
};

const IMAGE_FETCH_CONCURRENCY = 6;

function image_filename_from_url(url: string): string | null {
  try {
    const name = new URL(url).pathname.split("/").pop() ?? "";
    return name || null;
  } catch {
    return null;
  }
}

function note_stem(note_path: string): string {
  const name = note_path.split("/").pop() ?? note_path;
  return name.replace(/\.md$/i, "");
}

export class ClipService {
  constructor(
    private clip_port: ClipPort,
    private assets_port: AssetsPort,
    private note_service: NoteService,
    private document_service: DocumentService,
    private vault_store: VaultStore,
    private notes_store: NotesStore,
    private op_store: OpStore,
    private now_ms: () => number = () => Date.now(),
  ) {}

  async clip_page(request: ClipRequest): Promise<ClipResult> {
    const vault_id = this.vault_store.vault?.id;
    if (!vault_id) return { status: "skipped" };

    this.op_store.start("clip.page", this.now_ms());
    try {
      const result = await this.run_clip(request, vault_id);
      this.op_store.succeed("clip.page");
      return result;
    } catch (error) {
      const message =
        error instanceof ClipFetchError ? error.message : String(error);
      const kind = error instanceof ClipFetchError ? error.kind : "other";
      this.op_store.fail("clip.page", message);
      return { status: "failed", error: message, kind };
    }
  }

  async capture_start(url: string): Promise<void> {
    return this.clip_port.capture_start(url);
  }

  async capture_cancel(): Promise<void> {
    return this.clip_port.capture_cancel();
  }

  async on_capture_closed(handler: () => void): Promise<() => void> {
    return this.clip_port.on_capture_closed(handler);
  }

  private async fetch_page(request: ClipRequest): Promise<ClipPage> {
    if (request.source === "capture") {
      return this.clip_port.capture_finish();
    }
    const page = await this.clip_port.fetch_page(request.url);
    return this.prefer_rendered_figures(page);
  }

  // The rendered page is used only when it snapshotted composite figures;
  // otherwise the fetched HTML stays the source, as it always was.
  private async prefer_rendered_figures(page: ClipPage): Promise<ClipPage> {
    try {
      const rendered = await this.clip_port.render_page(page.final_url);
      return rendered.figure_snapshots.length > 0 ? rendered : page;
    } catch {
      return page;
    }
  }

  private async run_clip(
    request: ClipRequest,
    vault_id: VaultId,
  ): Promise<ClipResult> {
    const page = await this.fetch_page(request);
    const extracted = extract_readable_content(page.html, page.final_url);
    const now = new Date(this.now_ms());
    const custom_name = request.name?.trim() || null;
    const title_source = custom_name ?? extracted.title;
    const stem = clip_stem(title_source, page.final_url);
    const title = title_source ?? stem;

    const existing_paths = this.notes_store.notes.map((note) => note.path);
    const note_path = uniquify_note_path(
      request.folder_path,
      `${stem}.md`,
      existing_paths,
    );

    const localized = await this.localize_images(
      extracted,
      page.final_url,
      note_path,
      request.attachment_folder,
      vault_id,
    );
    const readable = await this.show_figure_snapshots(
      extracted,
      page.figure_snapshots,
      note_path,
      request.attachment_folder,
      vault_id,
      localized,
    );

    const outputs: ClipOutput[] = [];
    if (request.formats.markdown) {
      outputs.push(
        await this.emit_markdown(
          readable,
          page.final_url,
          note_path,
          title,
          now,
          localized,
        ),
      );
    }
    if (request.formats.html) {
      outputs.push(
        await this.emit_artifact(
          readable,
          page.final_url,
          request.folder_path,
          title,
          now,
          localized,
        ),
      );
    }
    if (request.formats.epub) {
      outputs.push(
        await this.emit_epub(
          readable,
          page.final_url,
          request.folder_path,
          stem,
          title,
          now,
          localized,
          existing_paths,
          vault_id,
        ),
      );
    }

    const primary = outputs[0];
    if (!primary) {
      return {
        status: "failed",
        error: "No output format selected",
        kind: "other",
      };
    }
    return {
      status: "clipped",
      outputs,
      primary,
      images_total: localized.plan.urls.length + localized.plan.skipped,
      images_failed: localized.plan.urls.filter(
        (url) => !localized.asset_paths.has(url),
      ).length,
      images_skipped: localized.plan.skipped,
    };
  }

  private async localize_images(
    readable: ReadableContent,
    base_url: string,
    note_path: string,
    attachment_folder: string,
    vault_id: VaultId,
  ): Promise<LocalizedImages> {
    const plan = plan_image_localization(readable.content_html, base_url);
    const asset_paths = new Map<string, AssetPath>();
    await map_with_concurrency(
      plan.urls,
      IMAGE_FETCH_CONCURRENCY,
      async (url) => {
        try {
          const asset = await this.clip_port.fetch_asset(url);
          const asset_path = await this.save_image(
            asset.bytes,
            asset.content_type,
            image_filename_from_url(url),
            note_path,
            attachment_folder,
            vault_id,
          );
          asset_paths.set(url, asset_path);
        } catch {
          // counted as failed: the url has no asset path
        }
      },
    );
    return { asset_paths, plan };
  }

  private async show_figure_snapshots(
    readable: ReadableContent,
    snapshots: FigureSnapshot[],
    note_path: string,
    attachment_folder: string,
    vault_id: VaultId,
    localized: LocalizedImages,
  ): Promise<ReadableContent> {
    if (snapshots.length === 0) return readable;
    const sources = new Map<number, string>();
    await map_with_concurrency(
      snapshots,
      IMAGE_FETCH_CONCURRENCY,
      async ({ index, png }) => {
        try {
          const asset_path = await this.save_image(
            png,
            "image/png",
            `figure-snapshot-${String(index)}.png`,
            note_path,
            attachment_folder,
            vault_id,
          );
          localized.asset_paths.set(snapshot_url(index), asset_path);
          sources.set(index, snapshot_url(index));
        } catch {
          // the figure keeps its original elements
        }
      },
    );
    return {
      ...readable,
      content_html: apply_figure_snapshots(readable.content_html, sources),
    };
  }

  private save_image(
    bytes: Uint8Array,
    mime_type: string,
    file_name: string | null,
    note_path: string,
    attachment_folder: string,
    vault_id: VaultId,
  ): Promise<AssetPath> {
    return this.assets_port.write_image_asset(vault_id, {
      note_path: as_note_path(note_path),
      image: { bytes, mime_type, file_name },
      attachment_folder,
      subfolder: note_stem(note_path),
    });
  }

  private relative_mapping(
    anchor_path: string,
    localized: LocalizedImages,
  ): Map<string, string> {
    const mapping = new Map<string, string>();
    for (const [url, asset_path] of localized.asset_paths) {
      mapping.set(
        url,
        to_markdown_asset_target(as_note_path(anchor_path), asset_path),
      );
    }
    return mapping;
  }

  private async emit_markdown(
    readable: ReadableContent,
    base_url: string,
    note_path: string,
    title: string,
    now: Date,
    localized: LocalizedImages,
  ): Promise<ClipOutput> {
    const rewritten = rewrite_image_srcs(
      readable.content_html,
      base_url,
      this.relative_mapping(note_path, localized),
    );
    const markdown = html_to_markdown(rewritten);
    const content = build_clip_frontmatter(title, base_url, now) + markdown;
    const result = await this.note_service.import_markdown_file(
      as_note_path(note_path),
      as_markdown_text(content),
    );
    if (result.status !== "created") {
      throw new Error(
        result.status === "failed" ? result.error : "Note import skipped",
      );
    }
    return { kind: "markdown", path: note_path };
  }

  private async emit_artifact(
    readable: ReadableContent,
    base_url: string,
    folder_path: string,
    title: string,
    now: Date,
    localized: LocalizedImages,
  ): Promise<ClipOutput> {
    const artifact_anchor = folder_path
      ? `${folder_path}/artifact.html`
      : "artifact.html";
    const rewritten = rewrite_image_srcs(
      readable.content_html,
      base_url,
      this.relative_mapping(artifact_anchor, localized),
    );
    const sanitized = sanitize_html(rewritten, {
      allowed_elements: get_preview_allowlist(),
    });
    const safe_title = title.replace(/&/g, "&amp;").replace(/</g, "&lt;");
    const html = `<title>${safe_title}</title>\n${sanitized}`;
    const saved = await this.document_service.save_html_artifact(
      folder_path,
      html,
      now,
      build_clip_provenance(base_url, now),
    );
    if (!saved) {
      throw new Error("Failed to save HTML artifact");
    }
    return { kind: "html", path: saved.html_path };
  }

  private async emit_epub(
    readable: ReadableContent,
    base_url: string,
    folder_path: string,
    stem: string,
    title: string,
    now: Date,
    localized: LocalizedImages,
    existing_paths: string[],
    vault_id: VaultId,
  ): Promise<ClipOutput> {
    const mapping = new Map<string, string>();
    const images: EpubImage[] = [];
    let index = 0;
    for (const [url, asset_path] of localized.asset_paths) {
      const ext = asset_path.split(".").pop() || "img";
      const href = `images/img-${String(index)}.${ext}`;
      mapping.set(url, href);
      images.push({ href, asset_path, media_type: epub_media_type(ext) });
      index += 1;
    }
    const rewritten = rewrite_image_srcs(
      readable.content_html,
      base_url,
      mapping,
    );
    const xhtml = to_xhtml_document(title, rewritten);
    const epub_path = uniquify_note_path(
      folder_path,
      `${stem}.epub`,
      existing_paths,
    );
    await this.clip_port.write_epub(vault_id, epub_path, {
      title,
      source_url: base_url,
      created_at: now.toISOString(),
      xhtml,
      css: null,
      images,
    });
    return { kind: "epub", path: epub_path };
  }
}
