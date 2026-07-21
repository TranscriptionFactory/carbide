import type { ClipEpubImage, ClipPort } from "$lib/features/clip/ports";
import {
  extract_readable_content,
  type ReadableContent,
} from "$lib/features/clip/domain/extract_readable_content";
import {
  plan_image_localization,
  rewrite_image_srcs,
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
import { html_to_markdown, sanitize_html } from "$lib/shared/html";
import {
  as_markdown_text,
  as_note_path,
  type AssetPath,
  type VaultId,
} from "$lib/shared/types/ids";

export type { ClipFormats };

export type ClipRequest = {
  url: string;
  folder_path: string;
  formats: ClipFormats;
  attachment_folder: string;
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
    }
  | { status: "skipped" }
  | { status: "failed"; error: string };

type LocalizedImages = {
  asset_paths: Map<string, AssetPath>;
  failed: number;
};

function image_filename_from_url(url: string): string | null {
  try {
    const name = new URL(url).pathname.split("/").pop() ?? "";
    return name || null;
  } catch {
    return null;
  }
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
      const message = String(error);
      this.op_store.fail("clip.page", message);
      return { status: "failed", error: message };
    }
  }

  private async run_clip(
    request: ClipRequest,
    vault_id: VaultId,
  ): Promise<ClipResult> {
    const page = await this.clip_port.fetch_page(request.url);
    const readable = extract_readable_content(page.html, page.final_url);
    const now = new Date(this.now_ms());
    const stem = clip_stem(readable.title, page.final_url);
    const title = readable.title ?? stem;

    const existing_paths = this.notes_store.notes.map((note) => note.path);
    const note_path = uniquify_note_path(
      request.folder_path,
      `${stem}.md`,
      existing_paths,
    );

    const localized = await this.localize_images(
      readable,
      page.final_url,
      note_path,
      request.attachment_folder,
      vault_id,
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
      return { status: "failed", error: "No output format selected" };
    }
    return {
      status: "clipped",
      outputs,
      primary,
      images_total: localized.asset_paths.size + localized.failed,
      images_failed: localized.failed,
    };
  }

  private async localize_images(
    readable: ReadableContent,
    base_url: string,
    note_path: string,
    attachment_folder: string,
    vault_id: VaultId,
  ): Promise<LocalizedImages> {
    const urls = plan_image_localization(readable.content_html, base_url);
    const asset_paths = new Map<string, AssetPath>();
    let failed = 0;
    for (const url of urls) {
      try {
        const asset = await this.clip_port.fetch_asset(url);
        const asset_path = await this.assets_port.write_image_asset(vault_id, {
          note_path: as_note_path(note_path),
          image: {
            bytes: asset.bytes,
            mime_type: asset.content_type,
            file_name: image_filename_from_url(url),
          },
          attachment_folder,
        });
        asset_paths.set(url, asset_path);
      } catch {
        failed += 1;
      }
    }
    return { asset_paths, failed };
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
    const sanitized = sanitize_html(rewritten);
    const safe_title = title.replace(/</g, "&lt;");
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
    const images: ClipEpubImage[] = [];
    let index = 0;
    for (const [url, asset_path] of localized.asset_paths) {
      const ext = asset_path.split(".").pop() || "img";
      const href = `images/img-${String(index)}.${ext}`;
      mapping.set(url, href);
      images.push({ href, asset_path, media_type: media_type_for_ext(ext) });
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
      clipped_at: now.toISOString(),
      xhtml,
      images,
    });
    return { kind: "epub", path: epub_path };
  }
}

function media_type_for_ext(ext: string): string {
  switch (ext.toLowerCase()) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}

function to_xhtml_document(title: string, body_html: string): string {
  const doc = new DOMParser().parseFromString(
    `<html><head><meta charset="utf-8"/><title></title></head><body>${body_html}</body></html>`,
    "text/html",
  );
  doc.title = title;
  const serialized = new XMLSerializer().serializeToString(doc);
  return `<?xml version="1.0" encoding="utf-8"?>\n${serialized}`;
}
