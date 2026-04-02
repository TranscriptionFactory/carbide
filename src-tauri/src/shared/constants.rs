pub const APP_DIR: &str = ".carbide";
pub const GIT_DIR: &str = ".git";

pub const IWE_DIR: &str = ".iwe";

pub const EXCLUDED_FOLDERS: &[&str] = &[APP_DIR, GIT_DIR, IWE_DIR];

pub fn is_excluded_folder(name: &str) -> bool {
    EXCLUDED_FOLDERS.contains(&name)
}
