export interface SettingsPort {
  get_setting<T>(key: string): Promise<T | null>;
  set_setting(key: string, value: unknown): Promise<void>;
}

export type VaultDbInfo = {
  vault_id: string;
  vault_name: string;
  size_bytes: number;
  is_orphaned: boolean;
};

export type StorageStats = {
  vault_dbs: VaultDbInfo[];
  total_db_bytes: number;
  orphaned_count: number;
  orphaned_bytes: number;
  embedding_cache_bytes: number;
};

export type StoragePort = {
  get_storage_stats(): Promise<StorageStats>;
  cleanup_orphaned_dbs(): Promise<number>;
  clear_embedding_model_cache(): Promise<number>;
  purge_all_asset_caches(): Promise<void>;
};
