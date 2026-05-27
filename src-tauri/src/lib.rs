use std::process::Command;
use std::path::Path;

#[derive(serde::Serialize)]
struct GitCommandOutput {
    stdout: String,
    stderr: String,
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
            format!("{}...HEAD", target_branch.unwrap_or_else(|| "main".into())),
        ],
        // A real listener will provide a stored baseline. Until then this keeps
        // the mode usable for local validation without changing Git state.
        "previous-session" => vec!["diff".into()],
        _ => return Err(format!("Unsupported compare mode: {}", mode)),
    };

    args.push("--".into());
    run_git(project_path, args)
}

#[tauri::command]
fn git_current_branch(project_path: String) -> Result<String, String> {
    let output = run_git(
        project_path,
        vec!["branch".into(), "--show-current".into()],
    )?;
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
    let code_status = Command::new("code")
        .arg("-g")
        .arg(&full_path)
        .status();

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
        Ok(GitCommandOutput { stdout, stderr })
    } else {
        Err(if stderr.trim().is_empty() {
            "Git command failed".into()
        } else {
            stderr
        })
    }
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
