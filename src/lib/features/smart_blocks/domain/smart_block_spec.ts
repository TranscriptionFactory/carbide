import type { SmartBlockSpec } from "../ports";

export function parse_smart_block(language: string, body: string): SmartBlockSpec {
  return { type: language.trim(), body };
}
