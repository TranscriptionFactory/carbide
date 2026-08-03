// Composer state, never session state: the attachment references an open
// buffer, so it must not enter the persisted session format. Snapshot
// semantics like the This-note chip — it names what was attached; content is
// resolved fresh from the buffer at submit time.
export type DocumentAttachment = {
  path: string;
  title: string;
};

// The attachment with its content resolved fresh from the buffer at submit
// time — the shape the retrieval pipeline and prompt builder consume.
export type ResolvedAttachment = DocumentAttachment & {
  content: string;
};
