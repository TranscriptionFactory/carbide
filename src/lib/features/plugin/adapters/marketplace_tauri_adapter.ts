import { invoke } from "@tauri-apps/api/core";
import type { MarketplacePort, MarketplacePluginFile } from "../ports";

export class MarketplaceTauriAdapter implements MarketplacePort {
  async fetch_index(url: string): Promise<string> {
    return invoke<string>("marketplace_fetch_index", { url });
  }

  async install_plugin(
    plugin_id: string,
    files: MarketplacePluginFile[],
  ): Promise<void> {
    await invoke("marketplace_install_plugin", { pluginId: plugin_id, files });
  }
}
