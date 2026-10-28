import type { SheetHostMessage } from "$lib/features/document/domain/sheet_bridge";

export function create_fake_sheet_iframe() {
  const posted: SheetHostMessage[] = [];
  return {
    posted,
    post: (message: SheetHostMessage) => {
      posted.push(message);
    },
    posted_types: () => posted.map((m) => m.type),
  };
}
