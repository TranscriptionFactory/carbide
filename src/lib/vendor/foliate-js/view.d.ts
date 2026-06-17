// Minimal type stub for the vendored foliate-js entry module. Importing it
// registers the <foliate-view> custom element as a side effect. The element's
// consumed interface is typed in
// $lib/features/document/types/foliate (FoliateView).
export class View extends HTMLElement {}
export function makeBook(file: Blob | File | string): Promise<unknown>;
export class ResponseError extends Error {}
export class NotFoundError extends Error {}
export class UnsupportedTypeError extends Error {}
