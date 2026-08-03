import type { DocumentAttachment } from "$lib/features/assistant/types/attachment";

// The attachment feeds whole-file rewrites, so the cap REFUSES rather than
// truncates: a truncated rewrite destroys the truncated tail on apply.
export const ATTACHMENT_MAX_CHARS = 200_000;

// Context source id for the prompt section. Unnumbered — the attachment is
// first-party material, not a citable retrieved source.
export const ATTACHED_DOCUMENT_SOURCE_ID = "attached_document";

export type AttachmentResult =
  | { status: "attached"; attachment: DocumentAttachment }
  | { status: "too_large"; chars: number; max: number };

export function build_document_attachment(target: {
  path: string;
  title: string;
  content: string;
}): AttachmentResult {
  if (target.content.length > ATTACHMENT_MAX_CHARS) {
    return {
      status: "too_large",
      chars: target.content.length,
      max: ATTACHMENT_MAX_CHARS,
    };
  }
  return {
    status: "attached",
    attachment: { path: target.path, title: target.title },
  };
}

export function attachment_label(
  attachment: DocumentAttachment,
  open: boolean,
): string {
  return open ? attachment.title : `${attachment.title} (closed)`;
}
