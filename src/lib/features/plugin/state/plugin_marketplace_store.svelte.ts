import type { MarketplacePluginListing } from "../ports";

export class PluginMarketplaceStore {
  listings = $state<MarketplacePluginListing[]>([]);
  url = $state<string | null>(null);

  set_listings(listings: MarketplacePluginListing[]) {
    this.listings = listings;
  }

  set_url(url: string | null) {
    this.url = url;
  }
}
