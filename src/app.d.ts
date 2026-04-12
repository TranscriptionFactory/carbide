declare module "*.ttf?url" {
  const url: string;
  export default url;
}

declare global {
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
