use git2::{
    build::CheckoutBuilder, DiffFormat, DiffOptions, IndexAddOption, ObjectType, Repository,
    Signature, Sort, StatusOptions, StatusShow,
};
use serde::Serialize;
use specta::Type;
use std::path::Path;
use std::time::Duration;

#[derive(Debug, Clone, Serialize, Type)]
pub struct GitFileStatus {
    pub path: String,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Type)]
pub struct GitStatus {
    pub branch: String,
    pub is_dirty: bool,
    pub ahead: usize,
    pub behind: usize,
    pub has_remote: bool,
    pub has_upstream: bool,
    pub remote_url: Option<String>,
    pub files: Vec<GitFileStatus>,
}

#[derive(Debug, Clone, Serialize, Type)]
pub struct GitCommit {
    pub hash: String,
    pub short_hash: String,
    pub author: String,
    pub timestamp_ms: i64,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Type)]
pub struct GitDiffLine {
    #[serde(rename = "type")]
    pub line_type: String,
    pub content: String,
    pub old_line: Option<u32>,
    pub new_line: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Type)]
pub struct GitDiffHunk {
    pub file_path: String,
    pub header: String,
    pub lines: Vec<GitDiffLine>,
}

#[derive(Debug, Clone, Serialize, Type)]
pub struct GitDiff {
    pub additions: usize,
    pub deletions: usize,
    pub hunks: Vec<GitDiffHunk>,
}

fn open_repo(vault_path: &str) -> Result<Repository, String> {
    Repository::open(vault_path).map_err(|e| format!("failed to open repo: {}", e))
}

fn repo_index(repo: &Repository) -> Result<git2::Index, String> {
    repo.index()
        .map_err(|e| format!("failed to get index: {}", e))
}

fn default_signature() -> Result<Signature<'static>, String> {
    Signature::now("Carbide", "carbide@local")
        .map_err(|e| format!("failed to create signature: {}", e))
}

fn write_default_gitignore_if_missing(vault_path: &str) -> Result<(), String> {
    let gitignore_path = Path::new(vault_path).join(".gitignore");
    if gitignore_path.exists() {
        return Ok(());
    }

    std::fs::write(
        &gitignore_path,
        "node_modules/\n.DS_Store\n*.tmp\n.env\nThumbs.db\n.carbide/\n",
    )
    .map_err(|e| format!("failed to write .gitignore: {}", e))
}

fn working_status_options() -> StatusOptions {
    let mut opts = StatusOptions::new();
    opts.show(StatusShow::IndexAndWorkdir);
    opts.include_untracked(true);
    opts.recurse_untracked_dirs(true);
    opts
}

fn status_string(s: git2::Status) -> &'static str {
    if s.is_conflicted() {
        "conflicted"
    } else if s.is_index_new() {
        "added"
    } else if s.is_wt_new() {
        "untracked"
    } else if s.is_wt_deleted() || s.is_index_deleted() {
        "deleted"
    } else if s.is_wt_modified()
        || s.is_index_modified()
        || s.is_wt_renamed()
        || s.is_index_renamed()
    {
        "modified"
    } else {
        "untracked"
    }
}

#[tauri::command]
#[specta::specta]
pub fn git_has_repo(vault_path: String) -> Result<bool, String> {
    Ok(Path::new(&vault_path).join(".git").exists())
}

#[tauri::command]
#[specta::specta]
pub fn git_init_repo(vault_path: String) -> Result<(), String> {
    let repo = Repository::init(&vault_path).map_err(|e| format!("failed to init repo: {}", e))?;
    write_default_gitignore_if_missing(&vault_path)?;
    let mut index = repo_index(&repo)?;
    stage_all_files(&repo, &mut index)?;
    let (_, tree) = write_index_tree(&repo, &mut index)?;
    commit_tree(&repo, "Initial commit", &tree, None)?;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn git_status(vault_path: String) -> Result<GitStatus, String> {
    let repo = open_repo(&vault_path)?;

    let branch = match repo.head() {
        Ok(head) => head.shorthand().unwrap_or("HEAD").to_string(),
        Err(_) => "HEAD".to_string(),
    };

    let mut opts = working_status_options();

    let statuses = repo
        .statuses(Some(&mut opts))
        .map_err(|e| format!("failed to get status: {}", e))?;

    let files: Vec<GitFileStatus> = statuses
        .iter()
        .filter_map(|entry| {
            let path = entry.path()?.to_string();
            let status = entry.status();
            if status.is_ignored() {
                return None;
            }
            Some(GitFileStatus {
                path,
                status: status_string(status).to_string(),
            })
        })
        .collect();

    let is_dirty = !files.is_empty();

    let origin = repo.find_remote("origin").ok();
    let has_remote = origin.is_some();
    let remote_url = origin.and_then(|r| r.url().map(|u| u.to_string()));

    let (ahead, behind, has_upstream) = match compute_ahead_behind(&repo) {
        Ok((a, b)) => (a, b, true),
        Err(_) => (0, 0, false),
    };

    Ok(GitStatus {
        branch,
        is_dirty,
        ahead,
        behind,
        has_remote,
        has_upstream,
        remote_url,
        files,
    })
}

fn compute_ahead_behind(repo: &Repository) -> Result<(usize, usize), git2::Error> {
    let head = repo.head()?;
    let local_oid = head
        .target()
        .ok_or_else(|| git2::Error::from_str("HEAD has no target"))?;

    let branch_name = head
        .shorthand()
        .ok_or_else(|| git2::Error::from_str("no branch name"))?;

    let upstream_name = format!("refs/remotes/origin/{}", branch_name);
    let upstream_ref = repo.find_reference(&upstream_name)?;
    let upstream_oid = upstream_ref
        .target()
        .ok_or_else(|| git2::Error::from_str("upstream has no target"))?;

    repo.graph_ahead_behind(local_oid, upstream_oid)
}

fn stage_selected_files(
    index: &mut git2::Index,
    vault_path: &str,
    paths: &[String],
) -> Result<(), String> {
    for path in paths {
        let full = Path::new(vault_path).join(path);
        if full.exists() {
            index
                .add_path(Path::new(path))
                .map_err(|e| format!("failed to stage {}: {}", path, e))?;
            continue;
        }
        index
            .remove_path(Path::new(path))
            .map_err(|e| format!("failed to remove {}: {}", path, e))?;
    }
    Ok(())
}

fn stage_all_files(repo: &Repository, index: &mut git2::Index) -> Result<(), String> {
    index
        .add_all(["*"].iter(), IndexAddOption::DEFAULT, None)
        .map_err(|e| format!("failed to stage all: {}", e))?;

    let statuses = repo
        .statuses(None)
        .map_err(|e| format!("failed to get status: {}", e))?;
    for entry in statuses.iter() {
        if entry.status().is_wt_deleted() || entry.status().is_index_deleted() {
            if let Some(path) = entry.path() {
                let _ = index.remove_path(Path::new(path));
            }
        }
    }
    Ok(())
}

fn stage_commit_files(
    repo: &Repository,
    index: &mut git2::Index,
    vault_path: &str,
    files: Option<Vec<String>>,
) -> Result<(), String> {
    match files {
        Some(paths) => stage_selected_files(index, vault_path, &paths),
        None => stage_all_files(repo, index),
    }
}

fn write_index_tree<'repo>(
    repo: &'repo Repository,
    index: &mut git2::Index,
) -> Result<(git2::Oid, git2::Tree<'repo>), String> {
    index
        .write()
        .map_err(|e| format!("failed to write index: {}", e))?;
    let tree_oid = index
        .write_tree()
        .map_err(|e| format!("failed to write tree: {}", e))?;
    let tree = repo
        .find_tree(tree_oid)
        .map_err(|e| format!("failed to find tree: {}", e))?;
    Ok((tree_oid, tree))
}

fn head_parent_commit(repo: &Repository) -> Option<git2::Commit<'_>> {
    repo.head().ok().and_then(|head| head.peel_to_commit().ok())
}

fn ensure_tree_has_changes(
    parent: Option<&git2::Commit<'_>>,
    tree_oid: git2::Oid,
) -> Result<(), String> {
    if let Some(parent_commit) = parent {
        if parent_commit.tree_id() == tree_oid {
            return Err("nothing to commit".to_string());
        }
    }
    Ok(())
}

fn commit_tree(
    repo: &Repository,
    message: &str,
    tree: &git2::Tree<'_>,
    parent: Option<&git2::Commit<'_>>,
) -> Result<String, String> {
    let sig = default_signature()?;
    let parents: Vec<&git2::Commit<'_>> = parent.into_iter().collect();
    let oid = repo
        .commit(Some("HEAD"), &sig, &sig, message, tree, &parents)
        .map_err(|e| format!("failed to commit: {}", e))?;
    Ok(oid.to_string())
}

#[tauri::command]
#[specta::specta]
pub fn git_stage_and_commit(
    vault_path: String,
    message: String,
    files: Option<Vec<String>>,
) -> Result<String, String> {
    let repo = open_repo(&vault_path)?;
    let mut index = repo_index(&repo)?;
    stage_commit_files(&repo, &mut index, &vault_path, files)?;
    let (tree_oid, tree) = write_index_tree(&repo, &mut index)?;
    let parent = head_parent_commit(&repo);
    ensure_tree_has_changes(parent.as_ref(), tree_oid)?;
    commit_tree(&repo, &message, &tree, parent.as_ref())
}

#[tauri::command]
#[specta::specta]
pub fn git_create_tag(vault_path: String, name: String, message: String) -> Result<(), String> {
    let repo = open_repo(&vault_path)?;
    let head = repo
        .head()
        .map_err(|e| format!("failed to resolve HEAD: {}", e))?;
    let target = head
        .peel(ObjectType::Commit)
        .map_err(|e| format!("failed to peel HEAD to commit: {}", e))?;
    let sig = default_signature()?;
    repo.tag(&name, &target, &sig, &message, false)
        .map_err(|e| format!("failed to create tag: {}", e))?;
    Ok(())
}

pub(crate) fn collect_git_log(
    vault_path: &str,
    file_path: Option<&str>,
    limit: usize,
) -> Result<Vec<GitCommit>, String> {
    let repo = open_repo(vault_path)?;

    match repo.head() {
        Err(e) if e.code() == git2::ErrorCode::UnbornBranch => return Ok(vec![]),
        Err(e) => return Err(format!("failed to read HEAD: {}", e)),
        Ok(_) => {}
    }

    let mut revwalk = repo
        .revwalk()
        .map_err(|e| format!("failed to create revwalk: {}", e))?;
    revwalk
        .push_head()
        .map_err(|e| format!("failed to push HEAD: {}", e))?;
    revwalk
        .set_sorting(Sort::TIME)
        .map_err(|e| format!("failed to set sorting: {}", e))?;

    let max_traversal = limit * 500;
    let mut traversed: usize = 0;
    let mut commits = Vec::new();

    for oid_result in revwalk {
        if commits.len() >= limit {
            break;
        }
        traversed += 1;
        if traversed > max_traversal {
            break;
        }

        let oid = oid_result.map_err(|e| format!("revwalk error: {}", e))?;
        let commit = repo
            .find_commit(oid)
            .map_err(|e| format!("failed to find commit: {}", e))?;

        if let Some(fp) = file_path {
            if !commit_touches_file(&repo, &commit, fp) {
                continue;
            }
        }
        commits.push(to_git_commit(commit));
    }

    Ok(commits)
}

#[tauri::command]
#[specta::specta]
pub async fn git_log(
    vault_path: String,
    file_path: Option<String>,
    limit: usize,
) -> Result<Vec<GitCommit>, String> {
    let task = tauri::async_runtime::spawn_blocking(move || {
        collect_git_log(&vault_path, file_path.as_deref(), limit)
    });
    match tokio::time::timeout(Duration::from_secs(10), task).await {
        Ok(join_result) => join_result
            .map_err(|error| format!("failed to join git log task: {}", error))?,
        Err(_) => Err("git log timed out after 10 seconds".to_string()),
    }
}

fn commit_touches_file(repo: &Repository, commit: &git2::Commit, path: &str) -> bool {
    let tree = match commit.tree() {
        Ok(t) => t,
        Err(_) => return false,
    };

    if commit.parent_count() == 0 {
        return tree.get_path(Path::new(path)).is_ok();
    }

    let mut all_parents_differ = true;
    for i in 0..commit.parent_count() {
        let parent = match commit.parent(i) {
            Ok(p) => p,
            Err(_) => continue,
        };
        let parent_tree = match parent.tree() {
            Ok(t) => t,
            Err(_) => continue,
        };

        let mut diff_opts = DiffOptions::new();
        diff_opts.pathspec(path);

        let diff =
            match repo.diff_tree_to_tree(Some(&parent_tree), Some(&tree), Some(&mut diff_opts)) {
                Ok(d) => d,
                Err(_) => continue,
            };

        if diff.stats().map(|s| s.files_changed()).unwrap_or(0) == 0 {
            all_parents_differ = false;
            break;
        }
    }

    all_parents_differ
}

fn to_git_commit(commit: git2::Commit<'_>) -> GitCommit {
    let hash = commit.id().to_string();
    let short_hash = hash[..7.min(hash.len())].to_string();

    GitCommit {
        hash,
        short_hash,
        author: commit.author().name().unwrap_or("Unknown").to_string(),
        timestamp_ms: commit.time().seconds() * 1000,
        message: commit.message().unwrap_or("").to_string(),
    }
}

fn resolve_tree_from_commit<'repo>(
    repo: &'repo Repository,
    commit_ref: &str,
) -> Result<git2::Tree<'repo>, String> {
    let obj = repo
        .revparse_single(commit_ref)
        .map_err(|e| format!("failed to find commit {}: {}", commit_ref, e))?;
    obj.peel(ObjectType::Tree)
        .map_err(|e| format!("failed to peel to tree: {}", e))?
        .into_tree()
        .map_err(|_| "not a tree".to_string())
}

fn build_diff_between_trees<'repo>(
    repo: &'repo Repository,
    tree_a: &'repo git2::Tree<'repo>,
    tree_b: &'repo git2::Tree<'repo>,
    file_path: Option<&str>,
) -> Result<git2::Diff<'repo>, String> {
    let mut diff_opts = DiffOptions::new();
    if let Some(path) = file_path {
        diff_opts.pathspec(path);
    }

    repo.diff_tree_to_tree(Some(tree_a), Some(tree_b), Some(&mut diff_opts))
        .map_err(|e| format!("failed to diff: {}", e))
}

fn line_type(origin: char) -> &'static str {
    match origin {
        '+' => "addition",
        '-' => "deletion",
        _ => "context",
    }
}

fn abbreviated_hash(hash: &str) -> &str {
    if hash.len() >= 7 {
        &hash[..7]
    } else {
        hash
    }
}

// Boundaries between hunks are keyed on (file_path, header), not header alone:
// two files whose hunks happen to share identical header text (e.g. two
// single-line new files both printing "@@ -0,0 +1 @@") must not merge, and
// consecutive binary files must not collapse into one "[Binary file]" entry.
fn delta_path(delta: &git2::DiffDelta<'_>) -> String {
    delta
        .new_file()
        .path()
        .or_else(|| delta.old_file().path())
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_default()
}

fn collect_diff_hunks(diff: &git2::Diff<'_>) -> Result<Vec<GitDiffHunk>, String> {
    let mut hunks: Vec<GitDiffHunk> = Vec::new();

    diff.print(DiffFormat::Patch, |delta, hunk, line| {
        let file_path = delta_path(&delta);

        if delta.flags().is_binary() {
            let starts_new_hunk = hunks
                .last()
                .map(|h| h.file_path != file_path || h.header != "[Binary file]")
                .unwrap_or(true);
            if starts_new_hunk {
                hunks.push(GitDiffHunk {
                    file_path,
                    header: "[Binary file]".to_string(),
                    lines: Vec::new(),
                });
            }
            return true;
        }

        if let Some(hunk_header) = hunk {
            let header = String::from_utf8_lossy(hunk_header.header()).to_string();
            let starts_new_hunk = hunks
                .last()
                .map(|h| h.file_path != file_path || h.header != header)
                .unwrap_or(true);
            if starts_new_hunk {
                hunks.push(GitDiffHunk {
                    file_path,
                    header,
                    lines: Vec::new(),
                });
            }
        }

        let content = String::from_utf8_lossy(line.content()).to_string();

        if let Some(current_hunk) = hunks.last_mut() {
            current_hunk.lines.push(GitDiffLine {
                line_type: line_type(line.origin()).to_string(),
                content,
                old_line: line.old_lineno(),
                new_line: line.new_lineno(),
            });
        }

        true
    })
    .map_err(|e| format!("failed to print diff: {}", e))?;

    Ok(hunks)
}

#[tauri::command]
#[specta::specta]
pub fn git_diff(
    vault_path: String,
    commit_a: String,
    commit_b: String,
    file_path: Option<String>,
) -> Result<GitDiff, String> {
    let repo = open_repo(&vault_path)?;
    let tree_a = resolve_tree_from_commit(&repo, &commit_a)?;
    let tree_b = resolve_tree_from_commit(&repo, &commit_b)?;
    let diff = build_diff_between_trees(&repo, &tree_a, &tree_b, file_path.as_deref())?;

    let stats = diff
        .stats()
        .map_err(|e| format!("failed to get diff stats: {}", e))?;
    let additions = stats.insertions();
    let deletions = stats.deletions();
    let hunks = collect_diff_hunks(&diff)?;

    Ok(GitDiff {
        additions,
        deletions,
        hunks,
    })
}

// `base_ref` anchors the diff to a specific commit (e.g. an agent turn's
// checkpoint sha) instead of whatever HEAD happens to be at read time. Without
// it, a commit landing between the checkpoint and this call (autocommit,
// another turn) silently shifts the base and truncates the diff — the base
// must be pinned by the caller, not inferred from HEAD, to make that failure
// mode impossible rather than merely unlikely.
pub(crate) fn git_diff_working(
    vault_path: &str,
    file_path: Option<&str>,
    base_ref: Option<&str>,
) -> Result<GitDiff, String> {
    let repo = open_repo(vault_path)?;

    let base_tree = match base_ref {
        Some(reference) => Some(resolve_tree_from_commit(&repo, reference)?),
        None => repo.head().ok().and_then(|h| h.peel_to_tree().ok()),
    };

    let mut diff_opts = DiffOptions::new();
    if let Some(path) = file_path {
        diff_opts.pathspec(path);
    }
    diff_opts.include_untracked(true);

    let diff = repo
        .diff_tree_to_workdir_with_index(base_tree.as_ref(), Some(&mut diff_opts))
        .map_err(|e| format!("failed to diff working tree: {}", e))?;

    let stats = diff
        .stats()
        .map_err(|e| format!("failed to get diff stats: {}", e))?;
    let additions = stats.insertions();
    let deletions = stats.deletions();
    let hunks = collect_diff_hunks(&diff)?;

    Ok(GitDiff {
        additions,
        deletions,
        hunks,
    })
}

#[tauri::command]
#[specta::specta]
pub fn git_diff_working_tree(
    vault_path: String,
    file_path: Option<String>,
    base_ref: Option<String>,
) -> Result<GitDiff, String> {
    git_diff_working(&vault_path, file_path.as_deref(), base_ref.as_deref())
}

#[tauri::command]
#[specta::specta]
pub fn git_show_file_at_commit(
    vault_path: String,
    file_path: String,
    commit_hash: String,
) -> Result<String, String> {
    let repo = open_repo(&vault_path)?;

    let obj = repo
        .revparse_single(&commit_hash)
        .map_err(|e| format!("failed to find commit {}: {}", commit_hash, e))?;
    let commit = obj
        .peel_to_commit()
        .map_err(|e| format!("failed to peel to commit: {}", e))?;
    let tree = commit
        .tree()
        .map_err(|e| format!("failed to get tree: {}", e))?;

    let entry = tree
        .get_path(Path::new(&file_path))
        .map_err(|e| format!("file not found at commit: {}", e))?;

    let blob = repo
        .find_blob(entry.id())
        .map_err(|e| format!("failed to read blob: {}", e))?;

    if blob.is_binary() {
        return Err("binary file cannot be displayed".to_string());
    }
    String::from_utf8(blob.content().to_vec())
        .map_err(|e| format!("file is not valid utf-8: {}", e))
}

#[tauri::command]
#[specta::specta]
pub fn git_restore_file(
    vault_path: String,
    file_path: String,
    commit_hash: String,
) -> Result<String, String> {
    let content =
        git_show_file_at_commit(vault_path.clone(), file_path.clone(), commit_hash.clone())?;
    let abs = Path::new(&vault_path).join(&file_path);

    if let Some(parent) = abs.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("failed to create directories: {}", e))?;
    }

    std::fs::write(&abs, &content).map_err(|e| format!("failed to write file: {}", e))?;

    let short_hash = abbreviated_hash(&commit_hash);
    let title = Path::new(&file_path)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or(&file_path);
    let message = format!("Restore: {} to {}", title, short_hash);

    git_stage_and_commit(vault_path, message, Some(vec![file_path]))
}

fn ensure_not_conflicted(repo: &Repository, file_path: &str) -> Result<(), String> {
    let status = repo
        .status_file(Path::new(file_path))
        .map_err(|e| format!("failed to read status for {}: {}", file_path, e))?;
    if status.is_conflicted() {
        return Err(format!(
            "{} has unresolved merge conflicts. Resolve them before discarding.",
            file_path
        ));
    }
    Ok(())
}

fn head_tree_has_path(repo: &Repository, file_path: &str) -> bool {
    head_parent_commit(repo)
        .and_then(|commit| commit.tree().ok())
        .is_some_and(|tree| tree.get_path(Path::new(file_path)).is_ok())
}

// Untracked and never-committed files have no HEAD blob to fall back to, so the
// only way to discard them is to delete them. This is the one place the project
// deletes user files outright; every caller must confirm first.
fn delete_never_committed(
    repo: &Repository,
    vault_path: &str,
    file_path: &str,
) -> Result<(), String> {
    let abs = Path::new(vault_path).join(file_path);
    if abs.exists() {
        std::fs::remove_file(&abs).map_err(|e| format!("failed to delete {}: {}", file_path, e))?;
    }

    let mut index = repo_index(repo)?;
    if index.get_path(Path::new(file_path), 0).is_some() {
        index
            .remove_path(Path::new(file_path))
            .map_err(|e| format!("failed to unstage {}: {}", file_path, e))?;
        index
            .write()
            .map_err(|e| format!("failed to write index: {}", e))?;
    }
    Ok(())
}

fn discard_one(repo: &Repository, vault_path: &str, file_path: &str) -> Result<(), String> {
    if !head_tree_has_path(repo, file_path) {
        return delete_never_committed(repo, vault_path, file_path);
    }

    let mut opts = CheckoutBuilder::new();
    opts.force().path(file_path);
    repo.checkout_head(Some(&mut opts))
        .map_err(|e| format!("failed to discard {}: {}", file_path, e))
}

fn changed_paths(repo: &Repository) -> Result<Vec<String>, String> {
    let mut opts = working_status_options();
    let statuses = repo
        .statuses(Some(&mut opts))
        .map_err(|e| format!("failed to get status: {}", e))?;
    Ok(statuses
        .iter()
        .filter(|entry| !entry.status().is_ignored())
        .filter_map(|entry| entry.path().map(|p| p.to_string()))
        .collect())
}

#[tauri::command]
#[specta::specta]
pub fn git_discard_file(vault_path: String, file_path: String) -> Result<(), String> {
    let repo = open_repo(&vault_path)?;
    ensure_not_conflicted(&repo, &file_path)?;
    discard_one(&repo, &vault_path, &file_path)
}

#[tauri::command]
#[specta::specta]
pub fn git_discard_all(
    vault_path: String,
    paths: Option<Vec<String>>,
) -> Result<Vec<String>, String> {
    let repo = open_repo(&vault_path)?;
    let targets = match paths {
        Some(explicit) => explicit,
        None => changed_paths(&repo)?,
    };

    for path in &targets {
        ensure_not_conflicted(&repo, path)?;
    }
    for path in &targets {
        discard_one(&repo, &vault_path, path)?;
    }
    Ok(targets)
}

#[derive(Debug, Clone, Serialize, Type)]
pub struct GitRemoteResult {
    pub success: bool,
    pub message: Option<String>,
    pub error: Option<String>,
}

const GIT_REMOTE_TIMEOUT_SECS: u64 = 30;

fn git_cmd(vault_path: &str) -> std::process::Command {
    let mut cmd = std::process::Command::new("git");
    cmd.current_dir(vault_path);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    cmd
}

fn run_with_timeout(
    mut cmd: std::process::Command,
    timeout: std::time::Duration,
) -> Result<std::process::Output, String> {
    let child = cmd
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("failed to spawn git: {}", e))?;

    let (tx, rx) = std::sync::mpsc::channel();

    let wait_thread = std::thread::spawn(move || {
        let result = child.wait_with_output();
        let _ = tx.send(());
        result
    });

    match rx.recv_timeout(timeout) {
        Ok(()) => wait_thread
            .join()
            .map_err(|_| "git process thread panicked".to_string())?
            .map_err(|e| format!("git process failed: {}", e)),
        Err(_) => Err(format!(
            "Git operation timed out after {}s. The remote may be unreachable or waiting for authentication.",
            timeout.as_secs()
        )),
    }
}

fn parse_remote_error(stderr: &str) -> Option<String> {
    if stderr.contains("Permission denied") || stderr.contains("publickey") {
        Some("Authentication failed. Check your SSH keys or credentials.".to_string())
    } else if stderr.contains("Could not resolve host") {
        Some("Could not connect to remote. Check your internet connection.".to_string())
    } else {
        None
    }
}

fn parse_push_error(stderr: &str) -> String {
    if let Some(msg) = parse_remote_error(stderr) {
        msg
    } else if stderr.contains("Repository not found") || stderr.contains("does not exist") {
        "Remote repository not found. Check the URL.".to_string()
    } else {
        stderr.trim().to_string()
    }
}

fn parse_pull_error(stderr: &str) -> String {
    if let Some(msg) = parse_remote_error(stderr) {
        msg
    } else if stderr.contains("local changes") || stderr.contains("unstaged changes") {
        "Commit your changes before syncing with remote.".to_string()
    } else if stderr.contains("CONFLICT") || stderr.contains("Merge conflict") {
        "Pull failed due to merge conflicts. Resolve conflicts manually.".to_string()
    } else if stderr.contains("not possible to fast-forward") {
        "Pull failed: local and remote have diverged. Try pulling with rebase or merging manually."
            .to_string()
    } else if stderr.contains("unrelated histories") {
        "Pull failed: repositories have unrelated histories.".to_string()
    } else {
        stderr.trim().to_string()
    }
}

fn is_valid_remote_url(url: &str) -> bool {
    let url = url.trim();
    url.starts_with("git@") || url.starts_with("https://") || url.starts_with("http://")
}

#[tauri::command]
#[specta::specta]
pub async fn git_push(vault_path: String) -> GitRemoteResult {
    tauri::async_runtime::spawn_blocking(move || {
        let mut cmd = git_cmd(&vault_path);
        cmd.args([
            "-c",
            "http.lowSpeedLimit=1000",
            "-c",
            "http.lowSpeedTime=10",
            "push",
        ])
        .env("GIT_SSH_COMMAND", "ssh -o ConnectTimeout=10");

        let timeout = std::time::Duration::from_secs(GIT_REMOTE_TIMEOUT_SECS);
        match run_with_timeout(cmd, timeout) {
            Ok(output) => {
                if output.status.success() {
                    GitRemoteResult {
                        success: true,
                        message: Some("Pushed successfully".to_string()),
                        error: None,
                    }
                } else {
                    GitRemoteResult {
                        success: false,
                        message: None,
                        error: Some(parse_push_error(&String::from_utf8_lossy(&output.stderr))),
                    }
                }
            }
            Err(e) => GitRemoteResult {
                success: false,
                message: None,
                error: Some(e),
            },
        }
    })
    .await
    .unwrap_or_else(|e| GitRemoteResult {
        success: false,
        message: None,
        error: Some(format!("task join error: {}", e)),
    })
}

#[tauri::command]
#[specta::specta]
pub async fn git_fetch(vault_path: String) -> GitRemoteResult {
    tauri::async_runtime::spawn_blocking(move || {
        let mut cmd = git_cmd(&vault_path);
        cmd.args([
            "-c",
            "http.lowSpeedLimit=1000",
            "-c",
            "http.lowSpeedTime=10",
            "fetch",
            "--quiet",
        ])
        .env("GIT_SSH_COMMAND", "ssh -o ConnectTimeout=10");

        let timeout = std::time::Duration::from_secs(GIT_REMOTE_TIMEOUT_SECS);
        match run_with_timeout(cmd, timeout) {
            Ok(output) => {
                if output.status.success() {
                    GitRemoteResult {
                        success: true,
                        message: Some("Fetched successfully".to_string()),
                        error: None,
                    }
                } else {
                    GitRemoteResult {
                        success: false,
                        message: None,
                        error: Some(parse_pull_error(&String::from_utf8_lossy(&output.stderr))),
                    }
                }
            }
            Err(e) => GitRemoteResult {
                success: false,
                message: None,
                error: Some(e),
            },
        }
    })
    .await
    .unwrap_or_else(|e| GitRemoteResult {
        success: false,
        message: None,
        error: Some(format!("task join error: {}", e)),
    })
}

#[tauri::command]
#[specta::specta]
pub async fn git_pull(vault_path: String, strategy: Option<String>) -> GitRemoteResult {
    tauri::async_runtime::spawn_blocking(move || {
        let selected_strategy = strategy.unwrap_or_else(|| "merge".to_string());
        let mut cmd = git_cmd(&vault_path);
        cmd.args([
            "-c",
            "http.lowSpeedLimit=1000",
            "-c",
            "http.lowSpeedTime=10",
        ])
        .env("GIT_SSH_COMMAND", "ssh -o ConnectTimeout=10");

        match selected_strategy.as_str() {
            "rebase" => {
                cmd.args(["-c", "pull.rebase=true", "pull", "--rebase"]);
            }
            "ff_only" => {
                cmd.args(["-c", "pull.ff=only", "pull", "--ff-only"]);
            }
            _ => {
                cmd.args(["-c", "pull.rebase=false", "pull"]);
            }
        }

        let timeout = std::time::Duration::from_secs(GIT_REMOTE_TIMEOUT_SECS);
        match run_with_timeout(cmd, timeout) {
            Ok(output) => {
                let stdout = String::from_utf8_lossy(&output.stdout);
                if output.status.success() {
                    let message = if stdout.contains("Already up to date") {
                        "Already up to date"
                    } else {
                        "Pulled latest changes"
                    };
                    GitRemoteResult {
                        success: true,
                        message: Some(message.to_string()),
                        error: None,
                    }
                } else {
                    let stderr = String::from_utf8_lossy(&output.stderr);
                    let combined = format!("{}{}", stdout, stderr);
                    GitRemoteResult {
                        success: false,
                        message: None,
                        error: Some(parse_pull_error(&combined)),
                    }
                }
            }
            Err(e) => GitRemoteResult {
                success: false,
                message: None,
                error: Some(e),
            },
        }
    })
    .await
    .unwrap_or_else(|e| GitRemoteResult {
        success: false,
        message: None,
        error: Some(format!("task join error: {}", e)),
    })
}

#[tauri::command]
#[specta::specta]
pub fn git_add_remote(vault_path: String, url: String) -> GitRemoteResult {
    if !is_valid_remote_url(&url) {
        return GitRemoteResult {
            success: false,
            message: None,
            error: Some(
                "Invalid remote URL. Must start with https://, http://, or git@".to_string(),
            ),
        };
    }

    let mut cmd = git_cmd(&vault_path);
    cmd.args(["remote", "add", "origin", &url]);

    let timeout = std::time::Duration::from_secs(GIT_REMOTE_TIMEOUT_SECS);
    match run_with_timeout(cmd, timeout) {
        Ok(output) => {
            if output.status.success() {
                GitRemoteResult {
                    success: true,
                    message: Some("Remote added successfully".to_string()),
                    error: None,
                }
            } else {
                let stderr = String::from_utf8_lossy(&output.stderr).to_string();
                if stderr.contains("already exists") {
                    GitRemoteResult {
                        success: false,
                        message: None,
                        error: Some("Remote 'origin' already exists".to_string()),
                    }
                } else {
                    GitRemoteResult {
                        success: false,
                        message: None,
                        error: Some(stderr),
                    }
                }
            }
        }
        Err(e) => GitRemoteResult {
            success: false,
            message: None,
            error: Some(format!("Failed to add remote: {}", e)),
        },
    }
}

#[tauri::command]
#[specta::specta]
pub fn git_set_remote_url(vault_path: String, url: String) -> GitRemoteResult {
    if !is_valid_remote_url(&url) {
        return GitRemoteResult {
            success: false,
            message: None,
            error: Some(
                "Invalid remote URL. Must start with https://, http://, or git@".to_string(),
            ),
        };
    }

    let timeout = std::time::Duration::from_secs(GIT_REMOTE_TIMEOUT_SECS);

    let has_origin = {
        let cmd = git_cmd(&vault_path);
        let mut check_cmd = cmd;
        check_cmd.args(["remote", "get-url", "origin"]);
        run_with_timeout(check_cmd, timeout)
            .map(|output| output.status.success())
            .unwrap_or(false)
    };

    let mut cmd = git_cmd(&vault_path);
    if has_origin {
        cmd.args(["remote", "set-url", "origin", &url]);
    } else {
        cmd.args(["remote", "add", "origin", &url]);
    }

    match run_with_timeout(cmd, timeout) {
        Ok(output) => {
            if output.status.success() {
                GitRemoteResult {
                    success: true,
                    message: Some(if has_origin {
                        "Remote updated successfully".to_string()
                    } else {
                        "Remote added successfully".to_string()
                    }),
                    error: None,
                }
            } else {
                GitRemoteResult {
                    success: false,
                    message: None,
                    error: Some(String::from_utf8_lossy(&output.stderr).trim().to_string()),
                }
            }
        }
        Err(e) => GitRemoteResult {
            success: false,
            message: None,
            error: Some(format!("Failed to update remote: {}", e)),
        },
    }
}

#[tauri::command]
#[specta::specta]
pub async fn git_push_with_upstream(vault_path: String, branch: String) -> GitRemoteResult {
    tauri::async_runtime::spawn_blocking(move || {
        let mut cmd = git_cmd(&vault_path);
        cmd.args([
            "-c",
            "http.lowSpeedLimit=1000",
            "-c",
            "http.lowSpeedTime=10",
            "push",
            "-u",
            "origin",
            &branch,
        ])
        .env("GIT_SSH_COMMAND", "ssh -o ConnectTimeout=10");

        let timeout = std::time::Duration::from_secs(GIT_REMOTE_TIMEOUT_SECS);
        match run_with_timeout(cmd, timeout) {
            Ok(output) => {
                if output.status.success() {
                    GitRemoteResult {
                        success: true,
                        message: Some(format!("Pushed and tracking origin/{}", branch)),
                        error: None,
                    }
                } else {
                    GitRemoteResult {
                        success: false,
                        message: None,
                        error: Some(parse_push_error(&String::from_utf8_lossy(&output.stderr))),
                    }
                }
            }
            Err(e) => GitRemoteResult {
                success: false,
                message: None,
                error: Some(e),
            },
        }
    })
    .await
    .unwrap_or_else(|e| GitRemoteResult {
        success: false,
        message: None,
        error: Some(format!("task join error: {}", e)),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    fn init_vault(files: &[(&str, &str)]) -> (TempDir, String) {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_string_lossy().to_string();
        for (name, content) in files {
            fs::write(dir.path().join(name), content).unwrap();
        }
        git_init_repo(root.clone()).unwrap();
        (dir, root)
    }

    fn head_hash(root: &str) -> String {
        let repo = open_repo(root).unwrap();
        let hash = repo.head().unwrap().peel_to_commit().unwrap().id();
        hash.to_string()
    }

    fn read(root: &str, name: &str) -> String {
        fs::read_to_string(Path::new(root).join(name)).unwrap()
    }

    // Diverge HEAD and a detached commit on the same file, then merge so libgit2
    // writes real conflict stages into the index.
    fn conflict_note(dir: &TempDir, root: &str, name: &str) {
        let repo = open_repo(root).unwrap();
        let theirs = {
            let base = repo.head().unwrap().peel_to_commit().unwrap();
            let blob = repo.blob(b"theirs\n").unwrap();
            let mut builder = repo.treebuilder(Some(&base.tree().unwrap())).unwrap();
            builder.insert(name, blob, 0o100644).unwrap();
            let tree = repo.find_tree(builder.write().unwrap()).unwrap();
            let sig = default_signature().unwrap();
            repo.commit(None, &sig, &sig, "theirs", &tree, &[&base])
                .unwrap()
        };

        fs::write(dir.path().join(name), "ours\n").unwrap();
        git_stage_and_commit(
            root.to_string(),
            "ours".to_string(),
            Some(vec![name.to_string()]),
        )
        .unwrap();

        let annotated = repo.find_annotated_commit(theirs).unwrap();
        repo.merge(&[&annotated], None, None).unwrap();
        assert!(repo.status_file(Path::new(name)).unwrap().is_conflicted());
    }

    #[test]
    fn discard_restores_a_modified_file_without_committing() {
        let (dir, root) = init_vault(&[("note.md", "original\n")]);
        fs::write(dir.path().join("note.md"), "edited\n").unwrap();
        let before = head_hash(&root);

        git_discard_file(root.clone(), "note.md".to_string()).unwrap();

        assert_eq!(read(&root, "note.md"), "original\n");
        assert_eq!(head_hash(&root), before);
    }

    #[test]
    fn discard_deletes_an_untracked_file() {
        let (dir, root) = init_vault(&[("note.md", "original\n")]);
        fs::write(dir.path().join("scratch.md"), "draft\n").unwrap();
        let before = head_hash(&root);

        git_discard_file(root.clone(), "scratch.md".to_string()).unwrap();

        assert!(!dir.path().join("scratch.md").exists());
        assert_eq!(head_hash(&root), before);
    }

    #[test]
    fn discard_deletes_a_staged_but_never_committed_file() {
        let (dir, root) = init_vault(&[("note.md", "original\n")]);
        fs::write(dir.path().join("scratch.md"), "draft\n").unwrap();
        let repo = open_repo(&root).unwrap();
        let mut index = repo_index(&repo).unwrap();
        index.add_path(Path::new("scratch.md")).unwrap();
        index.write().unwrap();
        drop(index);
        drop(repo);

        git_discard_file(root.clone(), "scratch.md".to_string()).unwrap();

        assert!(!dir.path().join("scratch.md").exists());
        let repo = open_repo(&root).unwrap();
        let index = repo_index(&repo).unwrap();
        assert!(index.get_path(Path::new("scratch.md"), 0).is_none());
    }

    #[test]
    fn discard_restores_a_deleted_file() {
        let (dir, root) = init_vault(&[("note.md", "original\n")]);
        fs::remove_file(dir.path().join("note.md")).unwrap();
        let before = head_hash(&root);

        git_discard_file(root.clone(), "note.md".to_string()).unwrap();

        assert_eq!(read(&root, "note.md"), "original\n");
        assert_eq!(head_hash(&root), before);
    }

    #[test]
    fn discard_refuses_a_conflicted_file() {
        let (dir, root) = init_vault(&[("note.md", "base\n")]);
        conflict_note(&dir, &root, "note.md");

        let before = read(&root, "note.md");
        let err = git_discard_file(root.clone(), "note.md".to_string()).unwrap_err();

        assert!(err.contains("merge conflicts"), "unexpected error: {}", err);
        assert!(before.contains("<<<<<<<"), "merge left no conflict markers");
        assert_eq!(read(&root, "note.md"), before);
    }

    #[test]
    fn discard_all_without_paths_discards_every_change() {
        let (dir, root) = init_vault(&[("a.md", "a\n"), ("b.md", "b\n")]);
        fs::write(dir.path().join("a.md"), "edited\n").unwrap();
        fs::remove_file(dir.path().join("b.md")).unwrap();
        fs::write(dir.path().join("c.md"), "new\n").unwrap();
        let before = head_hash(&root);

        let mut discarded = git_discard_all(root.clone(), None).unwrap();
        discarded.sort();

        assert_eq!(discarded, vec!["a.md", "b.md", "c.md"]);
        assert_eq!(read(&root, "a.md"), "a\n");
        assert_eq!(read(&root, "b.md"), "b\n");
        assert!(!dir.path().join("c.md").exists());
        assert_eq!(head_hash(&root), before);
    }

    #[test]
    fn discard_all_with_explicit_paths_leaves_other_changes_alone() {
        let (dir, root) = init_vault(&[("a.md", "a\n"), ("b.md", "b\n")]);
        fs::write(dir.path().join("a.md"), "edited a\n").unwrap();
        fs::write(dir.path().join("b.md"), "edited b\n").unwrap();

        let discarded = git_discard_all(root.clone(), Some(vec!["a.md".to_string()])).unwrap();

        assert_eq!(discarded, vec!["a.md"]);
        assert_eq!(read(&root, "a.md"), "a\n");
        assert_eq!(read(&root, "b.md"), "edited b\n");
    }

    #[test]
    fn discard_all_rejects_the_batch_when_any_file_is_conflicted() {
        let (dir, root) = init_vault(&[("note.md", "base\n")]);
        conflict_note(&dir, &root, "note.md");

        fs::write(dir.path().join("other.md"), "untouched\n").unwrap();

        let err = git_discard_all(
            root.clone(),
            Some(vec!["other.md".to_string(), "note.md".to_string()]),
        )
        .unwrap_err();

        assert!(err.contains("merge conflicts"), "unexpected error: {}", err);
        assert!(dir.path().join("other.md").exists());
    }

    fn hunks_for<'a>(diff: &'a GitDiff, file_path: &str) -> Vec<&'a GitDiffHunk> {
        diff.hunks
            .iter()
            .filter(|h| h.file_path == file_path)
            .collect()
    }

    #[test]
    fn single_file_diff_still_attributes_every_hunk_to_the_requested_path() {
        let (dir, root) = init_vault(&[("note.md", "one\ntwo\nthree\n")]);
        fs::write(dir.path().join("note.md"), "one\nedited\nthree\n").unwrap();

        let diff = git_diff_working(&root, Some("note.md"), None).unwrap();

        assert!(!diff.hunks.is_empty());
        assert!(diff.hunks.iter().all(|h| h.file_path == "note.md"));
        assert_eq!(diff.additions, 1);
        assert_eq!(diff.deletions, 1);
    }

    #[test]
    fn two_modified_files_with_identical_hunk_headers_are_not_merged() {
        // Both files are single-line, changed at line 1 — the unified diff
        // hunk header ("@@ -1 +1 @@") depends only on line position/count,
        // not content, so it collides regardless of what the lines say.
        let (dir, root) = init_vault(&[("a.md", "one\n"), ("b.md", "two\n")]);
        fs::write(dir.path().join("a.md"), "alpha\n").unwrap();
        fs::write(dir.path().join("b.md"), "bravo\n").unwrap();

        let diff = git_diff_working(&root, None, None).unwrap();

        let a_hunks = hunks_for(&diff, "a.md");
        let b_hunks = hunks_for(&diff, "b.md");
        assert_eq!(a_hunks.len(), 1, "expected exactly one hunk for a.md");
        assert_eq!(b_hunks.len(), 1, "expected exactly one hunk for b.md");
        assert_eq!(
            a_hunks[0].header, b_hunks[0].header,
            "precondition: the two files' hunk headers must collide for this test to be meaningful"
        );
        assert!(a_hunks[0].lines.iter().any(|l| l.content.contains("alpha")));
        assert!(!a_hunks[0].lines.iter().any(|l| l.content.contains("bravo")));
        assert!(b_hunks[0].lines.iter().any(|l| l.content.contains("bravo")));
        assert!(!b_hunks[0].lines.iter().any(|l| l.content.contains("alpha")));
    }

    #[test]
    fn deleted_file_hunk_is_attributed_by_its_old_path() {
        let (dir, root) = init_vault(&[("gone.md", "will be deleted\n")]);
        fs::remove_file(dir.path().join("gone.md")).unwrap();

        let diff = git_diff_working(&root, None, None).unwrap();

        assert!(!diff.hunks.is_empty());
        assert!(diff.hunks.iter().all(|h| h.file_path == "gone.md"));
    }

    #[test]
    fn consecutive_binary_files_are_not_merged() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_string_lossy().to_string();
        fs::write(dir.path().join("a.bin"), [0u8, 1, 2, 3, 0, 4]).unwrap();
        fs::write(dir.path().join("b.bin"), [5u8, 6, 7, 8, 0, 9]).unwrap();
        git_init_repo(root.clone()).unwrap();

        fs::write(dir.path().join("a.bin"), [9u8, 8, 7, 6, 0, 5]).unwrap();
        fs::write(dir.path().join("b.bin"), [1u8, 2, 3, 4, 0, 9]).unwrap();

        let diff = git_diff_working(&root, None, None).unwrap();

        let binary_hunks: Vec<&GitDiffHunk> = diff
            .hunks
            .iter()
            .filter(|h| h.header == "[Binary file]")
            .collect();
        let mut paths: Vec<&str> = binary_hunks.iter().map(|h| h.file_path.as_str()).collect();
        paths.sort_unstable();
        assert_eq!(paths, vec!["a.bin", "b.bin"]);
    }

    #[test]
    fn commit_range_diff_attributes_hunks_per_file() {
        let (dir, root) = init_vault(&[("a.md", "a\n"), ("b.md", "b\n")]);
        let commit_a = head_hash(&root);
        fs::write(dir.path().join("a.md"), "a edited\n").unwrap();
        fs::write(dir.path().join("b.md"), "b edited\n").unwrap();
        let commit_b_hash =
            git_stage_and_commit(root.clone(), "edit both".to_string(), None).unwrap();

        let diff = git_diff(root.clone(), commit_a, commit_b_hash, None).unwrap();

        assert_eq!(hunks_for(&diff, "a.md").len(), 1);
        assert_eq!(hunks_for(&diff, "b.md").len(), 1);
    }

    // The load-bearing invariant behind D2-1: a checkpoint-anchored diff must
    // stay correct even when a commit unrelated to the turn (e.g. the
    // autocommit reactor) lands on HEAD between the checkpoint and the
    // end-of-turn read. Anchoring to HEAD implicitly would silently truncate
    // the diff the moment that race fires; anchoring to an explicit base_ref
    // does not.
    #[test]
    fn base_ref_anchors_diff_through_an_intervening_commit() {
        let (dir, root) = init_vault(&[("note.md", "start\n")]);
        let checkpoint_sha = head_hash(&root);

        fs::write(dir.path().join("note.md"), "start\nturn edit\n").unwrap();

        // Simulates the autocommit reactor racing the agent turn and
        // committing the very file the turn just wrote.
        git_stage_and_commit(
            root.clone(),
            "Checkpoint: autocommit note.md".to_string(),
            Some(vec!["note.md".to_string()]),
        )
        .unwrap();

        let default_diff = git_diff_working(&root, None, None).unwrap();
        assert!(
            hunks_for(&default_diff, "note.md").is_empty(),
            "demonstrates the hazard: an unanchored diff loses the turn's \
             edit once an unrelated commit absorbs it into HEAD"
        );

        let anchored_diff = git_diff_working(&root, None, Some(&checkpoint_sha)).unwrap();
        let note_hunks = hunks_for(&anchored_diff, "note.md");
        assert!(
            !note_hunks.is_empty(),
            "anchoring to the checkpoint sha must still see the turn's edit"
        );
        assert!(note_hunks
            .iter()
            .any(|h| h.lines.iter().any(|l| l.content.contains("turn edit"))));
    }
}
