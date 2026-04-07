import type { DocumentPort } from "$lib/features/document";

export function create_test_document_adapter(): DocumentPort {
  return {
    read_file: () => Promise.resolve(""),
    write_file: () => Promise.resolve(),
    resolve_asset_url: () => "",
    open_buffer: () => Promise.resolve(0),
    read_buffer_window: () => Promise.resolve(""),
    close_buffer: () => Promise.resolve(),
  };
}
