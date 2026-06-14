import type { VaultId } from "$lib/shared/types/ids";
import type { VaultFsEvent } from "$lib/features/watcher";

export type SmartBlockSpec = {
  type: string;
  body: string;
};

export type SmartBlockContext = {
  note_path: string | null;
  vault_id: VaultId | null;
  open_note: (path: string, fragment?: string) => void;
  subscribe_to_changes: (handler: (event: VaultFsEvent) => void) => () => void;
};

export interface SmartBlockInstance {
  dom: HTMLElement;
  update(spec: SmartBlockSpec): void;
  destroy(): void;
}

export interface SmartBlockHandler {
  type: string;
  create(spec: SmartBlockSpec, ctx: SmartBlockContext): SmartBlockInstance;
}

export interface SmartBlockRegistry {
  register(handler: SmartBlockHandler): void;
  get(type: string): SmartBlockHandler | undefined;
  has(type: string): boolean;
}
