pub const APP_DIR: &str = ".carbide";
pub const GIT_DIR: &str = ".git";

pub const IWE_DIR: &str = ".iwe";

pub const EXCLUDED_FOLDERS: &[&str] = &[APP_DIR, GIT_DIR, IWE_DIR];

pub const MAX_VAULT_WALK_DEPTH: usize = 64;
pub const MAX_DIR_ENTRIES: usize = 10_000;
pub const MAX_INDEXABLE_FILE_SIZE: u64 = 50 * 1024 * 1024; // 50 MB
pub const MAX_INDEXABLE_FILES: usize = 100_000;

pub fn is_excluded_folder(name: &str) -> bool {
    EXCLUDED_FOLDERS.contains(&name)
}
