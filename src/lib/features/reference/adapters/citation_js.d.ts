declare module "@citation-js/core" {
  export class Cite {
    constructor(data?: unknown, options?: CiteOptions);
    static async(data?: unknown, options?: CiteOptions): Promise<Cite>;
    data: CslJsonItem[];
    format(format: string, ...options: unknown[]): string;
  }

  interface CiteOptions {
    forceType?: string;
    generateGraph?: boolean;
    maxChainLength?: number;
    output?: {
      type?: string;
      style?: string;
    };
  }

  interface CslJsonItem {
    id: string;
    type: string;
    [key: string]: unknown;
  }
}

declare module "@citation-js/plugin-bibtex" {}
declare module "@citation-js/plugin-ris" {}
declare module "@citation-js/plugin-csl" {}
