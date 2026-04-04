declare global {
  const __CARBIDE_LITE__: boolean;

  namespace App {}

  interface FileSystemDirectoryHandle {
    values(): AsyncIterableIterator<FileSystemHandle>;
  }
}

declare module "@typescript-eslint/types" {
  export namespace TSESTree {
    export type Node = unknown;
  }
}

export {};
