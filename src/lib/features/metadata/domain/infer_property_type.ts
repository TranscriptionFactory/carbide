import type { PropertyType } from "../types";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}/;
const BOOL_RE = /^(true|false|yes|no)$/i;

export function infer_property_type(value: unknown): PropertyType {
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return "number";
  if (value instanceof Date) return "date";

  if (typeof value === "string") {
    if (ISO_DATE_RE.test(value)) return "date";
    if (BOOL_RE.test(value)) return "boolean";
    const num = Number(value);
    if (value.trim() !== "" && Number.isFinite(num)) return "number";
    return "string";
  }

  if (Array.isArray(value)) {
    if (value.every((v) => typeof v === "string" && v.length < 50))
      return "tags";
    return "array";
  }

  return "string";
}
