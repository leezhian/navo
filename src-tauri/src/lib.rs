use std::path::Path;
use std::process::Command;

#[derive(serde::Serialize)]
struct GitCommandOutput {
    stdout: String,
    stderr: String,
    file_snapshots: Vec<GitFileSnapshot>,
}

#[derive(serde::Serialize)]
struct GitFileSnapshot {
    old_path: Option<String>,
    new_path: Option<String>,
    old_content: Option<String>,
    new_content: Option<String>,
}

#[tauri::command]
fn run_git_diff(
    project_path: String,
    mode: String,
    target_branch: Option<String>,
) -> Result<GitCommandOutput, String> {
    let mut args: Vec<String> = match mode.as_str() {
        "unstaged" => vec!["diff".into()],
        "staged" => vec!["diff".into(), "--cached".into()],
        "branch" => vec![
            "diff".into(),
            format!("{}...HEAD", target_branch.as_deref().unwrap_or("main")),
        ],
        // A real listener will provide a stored baseline. Until then this keeps
        // the mode usable for local validation without changing Git state.
        "previous-session" => vec!["diff".into()],
        _ => return Err(format!("Unsupported compare mode: {}", mode)),
    };

    args.push("--".into());
    let output = run_git(project_path.clone(), args)?;
    let file_snapshots = collect_diff_file_snapshots(
        &project_path,
        &mode,
        target_branch.as_deref(),
        &output.stdout,
    );

    Ok(GitCommandOutput {
        stdout: output.stdout,
        stderr: output.stderr,
        file_snapshots,
    })
}

#[tauri::command]
fn git_current_branch(project_path: String) -> Result<String, String> {
    let output = run_git(project_path, vec!["branch".into(), "--show-current".into()])?;
    Ok(output.stdout.trim().to_string())
}

#[tauri::command]
fn git_branches(project_path: String) -> Result<Vec<String>, String> {
    let output = run_git(
        project_path,
        vec!["branch".into(), "--format=%(refname:short)".into()],
    )?;

    Ok(output
        .stdout
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(str::to_string)
        .collect())
}

#[tauri::command]
fn open_file_in_vscode(project_path: String, file_path: String) -> Result<(), String> {
    let full_path = Path::new(&project_path).join(file_path);
    // Tauri GUI 进程不一定继承 shell PATH，先尝试 code 命令，再回退到 macOS 应用打开方式。
    let code_status = Command::new("code").arg("-g").arg(&full_path).status();

    if matches!(code_status, Ok(status) if status.success()) {
        return Ok(());
    }

    let open_status = Command::new("open")
        .arg("-a")
        .arg("Visual Studio Code")
        .arg(full_path)
        .status()
        .map_err(|error| format!("Failed to open VS Code: {}", error))?;

    if open_status.success() {
        return Ok(());
    }

    Err("VS Code command failed".into())
}

fn run_git(project_path: String, args: Vec<String>) -> Result<GitCommandOutput, String> {
    let output = Command::new("git")
        .args(args)
        .current_dir(project_path)
        .output()
        .map_err(|error| format!("Failed to run git: {}", error))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if output.status.success() {
        Ok(GitCommandOutput {
            stdout,
            stderr,
            file_snapshots: Vec::new(),
        })
    } else {
        Err(if stderr.trim().is_empty() {
            "Git command failed".into()
        } else {
            stderr
        })
    }
}

fn collect_diff_file_snapshots(
    project_path: &str,
    mode: &str,
    target_branch: Option<&str>,
    raw_diff: &str,
) -> Vec<GitFileSnapshot> {
    let source = DiffContentSource::new(project_path, mode, target_branch);

    parse_diff_file_paths(raw_diff)
        .into_iter()
        .map(|file| GitFileSnapshot {
            old_content: file
                .old_path
                .as_ref()
                .and_then(|path| source.read_old_content(project_path, path)),
            new_content: file
                .new_path
                .as_ref()
                .and_then(|path| source.read_new_content(project_path, path)),
            old_path: file.old_path,
            new_path: file.new_path,
        })
        .collect()
}

struct DiffContentSource {
    old_treeish: String,
    new_treeish: Option<String>,
    read_new_from_worktree: bool,
}

impl DiffContentSource {
    fn new(project_path: &str, mode: &str, target_branch: Option<&str>) -> Self {
        match mode {
            "staged" => Self {
                old_treeish: "HEAD".into(),
                new_treeish: Some(":".into()),
                read_new_from_worktree: false,
            },
            "branch" => Self {
                old_treeish: resolve_merge_base(project_path, target_branch.unwrap_or("main"))
                    .unwrap_or_else(|| target_branch.unwrap_or("main").to_string()),
                new_treeish: Some("HEAD".into()),
                read_new_from_worktree: false,
            },
            _ => Self {
                old_treeish: ":".into(),
                new_treeish: None,
                read_new_from_worktree: true,
            },
        }
    }

    fn read_old_content(&self, project_path: &str, path: &str) -> Option<String> {
        read_git_object(project_path, &self.old_treeish, path)
    }

    fn read_new_content(&self, project_path: &str, path: &str) -> Option<String> {
        if self.read_new_from_worktree {
            return read_worktree_file(project_path, path);
        }

        self.new_treeish
            .as_ref()
            .and_then(|treeish| read_git_object(project_path, treeish, path))
    }
}

struct DiffFilePath {
    old_path: Option<String>,
    new_path: Option<String>,
}

fn parse_diff_file_paths(raw_diff: &str) -> Vec<DiffFilePath> {
    let mut files = Vec::new();
    let mut current: Option<DiffFilePath> = None;

    for line in raw_diff.lines() {
        if line.starts_with("diff --git ") {
            push_diff_file_path(&mut files, current.take());
            current = Some(parse_diff_git_header(line));
            continue;
        }

        if let Some(file) = current.as_mut() {
            if let Some(path) = line.strip_prefix("--- ") {
                file.old_path = normalize_diff_path(path);
            } else if let Some(path) = line.strip_prefix("+++ ") {
                file.new_path = normalize_diff_path(path);
            } else if let Some(path) = line.strip_prefix("rename from ") {
                file.old_path = Some(path.trim().to_string());
            } else if let Some(path) = line.strip_prefix("rename to ") {
                file.new_path = Some(path.trim().to_string());
            }
        }
    }

    push_diff_file_path(&mut files, current);
    files
}

fn push_diff_file_path(files: &mut Vec<DiffFilePath>, file: Option<DiffFilePath>) {
    if let Some(file) = file {
        if file.old_path.is_some() || file.new_path.is_some() {
            files.push(file);
        }
    }
}

fn parse_diff_git_header(line: &str) -> DiffFilePath {
    let mut parts = line.split_whitespace();
    let old_path = parts.nth(2).and_then(normalize_diff_path);
    let new_path = parts.next().and_then(normalize_diff_path);

    DiffFilePath { old_path, new_path }
}

fn normalize_diff_path(path: &str) -> Option<String> {
    let trimmed = path.trim();

    if trimmed == "/dev/null" {
        return None;
    }

    Some(
        trimmed
            .strip_prefix("a/")
            .or_else(|| trimmed.strip_prefix("b/"))
            .unwrap_or(trimmed)
            .to_string(),
    )
}

fn resolve_merge_base(project_path: &str, target_branch: &str) -> Option<String> {
    let output = Command::new("git")
        .args(["merge-base", target_branch, "HEAD"])
        .current_dir(project_path)
        .output()
        .ok()?;

    if output.status.success() {
        let base = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if !base.is_empty() {
            return Some(base);
        }
    }

    None
}

fn read_git_object(project_path: &str, treeish: &str, file_path: &str) -> Option<String> {
    let object_path = if treeish == ":" {
        format!(":{}", file_path)
    } else {
        format!("{}:{}", treeish, file_path)
    };

    let output = Command::new("git")
        .args(["show", &object_path])
        .current_dir(project_path)
        .output()
        .ok()?;

    if output.status.success() {
        String::from_utf8(output.stdout).ok()
    } else {
        None
    }
}

fn read_worktree_file(project_path: &str, file_path: &str) -> Option<String> {
    std::fs::read_to_string(Path::new(project_path).join(file_path)).ok()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            run_git_diff,
            git_current_branch,
            git_branches,
            open_file_in_vscode
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
