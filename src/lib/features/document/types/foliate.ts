export type FoliateTocItem = {
  label: string;
  href: string;
  subitems?: FoliateTocItem[];
};

export type FoliateRelocateDetail = {
  cfi: string;
  fraction?: number;
  tocItem?: { label?: string; href?: string } | null;
};

export type FoliateLoadDetail = {
  doc: Document;
  index: number;
};

export type FoliateTransformData = {
  data: string | Blob | Promise<string | Blob>;
  type: string;
  readonly name: string;
};

export type FoliateLoadResource = {
  type: string;
  isScript: boolean;
  allow: boolean;
};

export type FoliateBook = {
  toc?: FoliateTocItem[];
  metadata?: { title?: string | Record<string, string> };
  dir?: string;
  transformTarget?: EventTarget;
};

export type FoliateRenderer = {
  setStyles?: (styles: string | [string, string]) => void;
  setAttribute: (name: string, value: string) => void;
  next: () => Promise<void>;
  prev: () => Promise<void>;
};

export type FoliateSearchSubitem = { cfi: string; excerpt: string };

export type FoliateSearchYield =
  | { progress: number }
  | { label: string; subitems: FoliateSearchSubitem[] }
  | "done";

export interface FoliateView extends HTMLElement {
  book?: FoliateBook;
  renderer?: FoliateRenderer;
  open(book: Blob | File | string): Promise<void>;
  init(opts: {
    lastLocation?: string | number;
    showTextStart?: boolean;
  }): Promise<void>;
  goTo(target: string | number): Promise<unknown>;
  next(distance?: number): Promise<void>;
  prev(distance?: number): Promise<void>;
  goLeft(): Promise<void> | void;
  goRight(): Promise<void> | void;
  search(opts: {
    query: string;
    index?: number;
  }): AsyncGenerator<FoliateSearchYield>;
  clearSearch(): void;
  close(): void;
}
