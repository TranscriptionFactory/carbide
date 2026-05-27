import type { MarketplacePort, MarketplacePluginListing } from "../ports";
import type { PluginMarketplaceStore } from "../state/plugin_marketplace_store.svelte";
import type { SettingsPort } from "$lib/features/settings";
import type { OpStore } from "$lib/app/orchestration/op_store.svelte";

const DEFAULT_REPO_URL = "https://github.com/TranscriptionFactory/carbide";
const SETTINGS_KEY = "plugin_marketplace_url";

function repo_to_raw_base(repo_url: string): string {
  const cleaned = repo_url.replace(/\/$/, "");
  const match = cleaned.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (!match || !match[1] || !match[2])
    throw new Error(`Invalid GitHub repo URL: ${repo_url}`);
  return `https://raw.githubusercontent.com/${match[1]}/${match[2]}/refs/heads/main`;
}

function derive_index_url(repo_url: string): string {
  return `${repo_to_raw_base(repo_url)}/plugins/index.json`;
}

function derive_file_url(
  repo_url: string,
  plugin_id: string,
  filename: string,
): string {
  return `${repo_to_raw_base(repo_url)}/plugins/${plugin_id}/${filename}`;
}

export class PluginMarketplaceService {
  constructor(
    private marketplace_port: MarketplacePort,
    private settings_port: SettingsPort,
    private store: PluginMarketplaceStore,
    private op_store: OpStore,
  ) {}

  private get_repo_url(): string {
    return this.store.url ?? DEFAULT_REPO_URL;
  }

  async load_url(): Promise<void> {
    const stored = await this.settings_port.get_setting<string>(SETTINGS_KEY);
    this.store.set_url(stored ?? null);
  }

  async save_url(url: string): Promise<void> {
    await this.settings_port.set_setting(SETTINGS_KEY, url);
    this.store.set_url(url);
  }

  async fetch_listings(): Promise<void> {
    const op_key = "plugin.marketplace_fetch";
    this.op_store.start(op_key, Date.now());
    try {
      await this.load_url();
      const repo_url = this.get_repo_url();
      const index_url = derive_index_url(repo_url);
      const body = await this.marketplace_port.fetch_index(index_url);
      const raw = JSON.parse(body) as Array<{
        id: string;
        name: string;
        version: string;
        author: string;
        description: string;
        files: string[];
      }>;

      const listings: MarketplacePluginListing[] = raw.map((entry) => ({
        id: entry.id,
        name: entry.name,
        version: entry.version,
        author: entry.author,
        description: entry.description,
        files: entry.files.map((filename) => ({
          filename,
          downloadUrl: derive_file_url(repo_url, entry.id, filename),
        })),
      }));

      this.store.set_listings(listings);
      this.op_store.succeed(op_key);
    } catch (error) {
      this.op_store.fail(
        op_key,
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  }

  async install(plugin_id: string): Promise<void> {
    const listing = this.store.listings.find((l) => l.id === plugin_id);
    if (!listing) {
      throw new Error(
        `Plugin "${plugin_id}" not found in marketplace listings`,
      );
    }

    const op_key = `plugin.marketplace_install:${plugin_id}`;
    this.op_store.start(op_key, Date.now());
    try {
      await this.marketplace_port.install_plugin(plugin_id, listing.files);
      this.op_store.succeed(op_key);
    } catch (error) {
      this.op_store.fail(
        op_key,
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  }
}
