import { invoke } from "@tauri-apps/api/core";
import type { PluginHttpFetchRequest, PluginHttpFetchResponse } from "../ports";

export async function plugin_http_fetch(
  request: PluginHttpFetchRequest,
): Promise<PluginHttpFetchResponse> {
  return invoke<PluginHttpFetchResponse>("plugin_http_fetch", { request });
}
