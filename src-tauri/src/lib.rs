use serde::Deserialize;
use serde_json::Value;
use std::collections::HashSet;
use std::env;
use std::ffi::{OsStr, OsString};
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OrganizeRequest {
    mode: String,
    goal: String,
    policies: Value,
}

#[derive(Debug)]
struct CodexLaunch {
    executable: PathBuf,
    path_env: OsString,
}

fn is_executable(path: &Path) -> bool {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;

        fs::metadata(path)
            .map(|metadata| metadata.is_file() && metadata.permissions().mode() & 0o111 != 0)
            .unwrap_or(false)
    }

    #[cfg(not(unix))]
    {
        path.is_file()
    }
}

fn push_unique_dir(dirs: &mut Vec<PathBuf>, seen: &mut HashSet<PathBuf>, dir: PathBuf) {
    if dir.is_dir() && seen.insert(dir.clone()) {
        dirs.push(dir);
    }
}

fn push_versioned_bin_dirs(
    dirs: &mut Vec<PathBuf>,
    seen: &mut HashSet<PathBuf>,
    versions_root: &Path,
    suffix: &Path,
) {
    let Ok(entries) = fs::read_dir(versions_root) else {
        return;
    };

    let mut version_dirs = entries
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| path.is_dir())
        .collect::<Vec<_>>();
    version_dirs.sort();
    version_dirs.reverse();

    for version_dir in version_dirs {
        push_unique_dir(dirs, seen, version_dir.join(suffix));
    }
}

fn candidate_path_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    let mut seen = HashSet::new();

    if let Some(path) = env::var_os("PATH") {
        for dir in env::split_paths(&path) {
            push_unique_dir(&mut dirs, &mut seen, dir);
        }
    }

    for dir in ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin"] {
        push_unique_dir(&mut dirs, &mut seen, PathBuf::from(dir));
    }

    if let Some(home) = env::var_os("HOME").map(PathBuf::from) {
        for relative in [
            ".local/bin",
            ".npm/bin",
            ".npm-global/bin",
            ".volta/bin",
            ".bun/bin",
            "Library/pnpm",
            ".local/share/pnpm",
            ".asdf/shims",
            ".mise/shims",
        ] {
            push_unique_dir(&mut dirs, &mut seen, home.join(relative));
        }

        push_versioned_bin_dirs(
            &mut dirs,
            &mut seen,
            &home.join(".nvm/versions/node"),
            Path::new("bin"),
        );
        push_versioned_bin_dirs(
            &mut dirs,
            &mut seen,
            &home.join(".fnm/node-versions"),
            Path::new("installation/bin"),
        );
        push_versioned_bin_dirs(
            &mut dirs,
            &mut seen,
            &home.join(".local/share/fnm/node-versions"),
            Path::new("installation/bin"),
        );
        push_versioned_bin_dirs(
            &mut dirs,
            &mut seen,
            &home.join(".asdf/installs/nodejs"),
            Path::new("bin"),
        );
        push_versioned_bin_dirs(
            &mut dirs,
            &mut seen,
            &home.join(".local/share/mise/installs/node"),
            Path::new("bin"),
        );
    }

    dirs
}

fn find_executable(name: &str, dirs: &[PathBuf]) -> Option<PathBuf> {
    dirs.iter()
        .map(|dir| dir.join(name))
        .find(|candidate| is_executable(candidate))
}

fn codex_from_login_shell() -> Option<PathBuf> {
    let mut shells = Vec::new();
    if let Some(shell) = env::var_os("SHELL").map(PathBuf::from) {
        shells.push(shell);
    }
    for shell in [PathBuf::from("/bin/zsh"), PathBuf::from("/bin/bash")] {
        if !shells.contains(&shell) {
            shells.push(shell);
        }
    }

    for shell in shells {
        if !is_executable(&shell) {
            continue;
        }

        let Ok(output) = Command::new(&shell)
            .args(["-lic", "command -v codex"])
            .stdin(Stdio::null())
            .stderr(Stdio::null())
            .output()
        else {
            continue;
        };

        if !output.status.success() {
            continue;
        }

        for line in String::from_utf8_lossy(&output.stdout).lines().rev() {
            let candidate = PathBuf::from(line.trim());
            if candidate.is_absolute() && is_executable(&candidate) {
                return Some(candidate);
            }
        }
    }

    None
}

fn native_codex_distribution() -> Option<(&'static str, &'static str)> {
    match (env::consts::OS, env::consts::ARCH) {
        ("macos", "aarch64") => Some(("codex-darwin-arm64", "aarch64-apple-darwin")),
        ("macos", "x86_64") => Some(("codex-darwin-x64", "x86_64-apple-darwin")),
        ("linux", "aarch64") => Some(("codex-linux-arm64", "aarch64-unknown-linux-musl")),
        ("linux", "x86_64") => Some(("codex-linux-x64", "x86_64-unknown-linux-musl")),
        _ => None,
    }
}

fn native_codex_for(wrapper: &Path) -> Option<PathBuf> {
    let (package, target) = native_codex_distribution()?;
    let canonical = fs::canonicalize(wrapper).ok()?;

    // npm、pnpm 与 Homebrew 的全局安装可能采用不同的 node_modules
    // 布局，因此从包装脚本位置逐级向上尝试官方原生包路径。
    for ancestor in canonical.ancestors().take(8) {
        let candidate = ancestor
            .join("node_modules")
            .join("@openai")
            .join(package)
            .join("vendor")
            .join(target)
            .join("bin")
            .join("codex");
        if is_executable(&candidate) {
            return Some(candidate);
        }
    }

    None
}

fn requires_node(executable: &Path) -> bool {
    if executable.extension() == Some(OsStr::new("js")) {
        return true;
    }

    let mut prefix = [0_u8; 256];
    let Ok(mut file) = fs::File::open(executable) else {
        return false;
    };
    let Ok(length) = file.read(&mut prefix) else {
        return false;
    };
    let first_line = &prefix[..length]
        .split(|byte| *byte == b'\n')
        .next()
        .unwrap_or_default();

    std::str::from_utf8(first_line)
        .is_ok_and(|shebang| shebang.starts_with("#!") && shebang.contains("node"))
}

fn resolve_codex_launch() -> Result<CodexLaunch, String> {
    let mut path_dirs = candidate_path_dirs();
    let mut codex = find_executable("codex", &path_dirs).or_else(codex_from_login_shell);

    if let Some(found) = codex.as_ref().and_then(|path| path.parent()) {
        if !path_dirs.iter().any(|dir| dir == found) {
            path_dirs.insert(0, found.to_path_buf());
        }
    }

    let Some(wrapper_or_binary) = codex.take() else {
        return Err(
            "未找到 Codex CLI。请先在终端安装 Codex，并运行 `codex login` 完成登录。".to_string(),
        );
    };

    let executable = native_codex_for(&wrapper_or_binary).unwrap_or(wrapper_or_binary);

    if requires_node(&executable) && find_executable("node", &path_dirs).is_none() {
        return Err(format!(
            "已找到 Codex 启动脚本（{}），但未找到它依赖的 Node.js。请确认终端中 `node --version` 可以正常运行。",
            executable.display()
        ));
    }

    let path_env =
        env::join_paths(&path_dirs).map_err(|error| format!("无法构造 Codex 运行环境：{error}"))?;

    Ok(CodexLaunch {
        executable,
        path_env,
    })
}

fn extract_json(raw: &str) -> Result<String, String> {
    let start = raw.find('{').ok_or("Codex 没有返回 JSON 对象")?;
    let end = raw.rfind('}').ok_or("Codex 返回的 JSON 不完整")?;
    let candidate = &raw[start..=end];
    let value: Value =
        serde_json::from_str(candidate).map_err(|error| format!("无法解析 Codex 结果：{error}"))?;

    let operation_is_valid = value
        .get("operation")
        .and_then(Value::as_str)
        .is_some_and(|operation| operation == "replace" || operation == "append");

    if !operation_is_valid
        || !value.get("summary").is_some_and(Value::is_string)
        || !value.get("nodes").is_some_and(Value::is_array)
    {
        return Err("Codex 结果缺少 operation、summary 或 nodes 字段".to_string());
    }

    serde_json::to_string(&value).map_err(|error| error.to_string())
}

fn proxy_value(output: &str, key: &str) -> Option<String> {
    output.lines().find_map(|line| {
        let (name, value) = line.trim().split_once(':')?;
        (name.trim() == key).then(|| value.trim().to_string())
    })
}

fn proxy_url_from_scutil(output: &str) -> Option<String> {
    for prefix in ["HTTPS", "HTTP"] {
        if proxy_value(output, &format!("{prefix}Enable")).as_deref() != Some("1") {
            continue;
        }

        let Some(host) = proxy_value(output, &format!("{prefix}Proxy")) else {
            continue;
        };
        let Some(port) = proxy_value(output, &format!("{prefix}Port")) else {
            continue;
        };
        if host.is_empty() || port.parse::<u16>().is_err() {
            continue;
        }

        let formatted_host = if host.contains(':') && !host.starts_with('[') {
            format!("[{host}]")
        } else {
            host
        };
        return Some(format!("http://{formatted_host}:{port}"));
    }

    None
}

#[tauri::command]
fn system_proxy_url() -> Option<String> {
    for key in ["HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy"] {
        if let Some(proxy) = env::var_os(key).and_then(|value| value.into_string().ok()) {
            if proxy.starts_with("http://") || proxy.starts_with("https://") {
                return Some(proxy);
            }
        }
    }

    #[cfg(target_os = "macos")]
    {
        let output = Command::new("/usr/sbin/scutil")
            .arg("--proxy")
            .stdin(Stdio::null())
            .stderr(Stdio::null())
            .output()
            .ok()?;

        if output.status.success() {
            return proxy_url_from_scutil(&String::from_utf8_lossy(&output.stdout));
        }
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[cfg(unix)]
    fn write_executable(path: &Path, content: &[u8]) {
        use std::os::unix::fs::PermissionsExt;

        fs::create_dir_all(path.parent().expect("test file must have a parent")).unwrap();
        fs::write(path, content).unwrap();
        fs::set_permissions(path, fs::Permissions::from_mode(0o755)).unwrap();
    }

    #[test]
    #[cfg(unix)]
    fn detects_node_wrapper_by_shebang() {
        let root = unique_test_dir("node-wrapper");
        let wrapper = root.join("codex");
        write_executable(&wrapper, b"#!/usr/bin/env node\nconsole.log('codex');\n");

        assert!(requires_node(&wrapper));

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    #[cfg(unix)]
    fn resolves_native_binary_from_official_package_layout() {
        let Some((package, target)) = native_codex_distribution() else {
            return;
        };
        let root = unique_test_dir("native-codex");
        let wrapper = root.join("node_modules/@openai/codex/bin/codex.js");
        let native = root
            .join("node_modules/@openai/codex/node_modules/@openai")
            .join(package)
            .join("vendor")
            .join(target)
            .join("bin/codex");
        write_executable(&wrapper, b"#!/usr/bin/env node\n");
        write_executable(&native, b"#!/bin/sh\n");

        assert_eq!(
            native_codex_for(&wrapper),
            Some(fs::canonicalize(&native).unwrap())
        );

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn parses_enabled_https_system_proxy() {
        let output = r#"
<dictionary> {
  HTTPEnable : 0
  HTTPSEnable : 1
  HTTPSPort : 7897
  HTTPSProxy : 127.0.0.1
}
"#;

        assert_eq!(
            proxy_url_from_scutil(output),
            Some("http://127.0.0.1:7897".to_string())
        );
    }

    #[test]
    fn ignores_disabled_system_proxy() {
        let output = r#"
<dictionary> {
  HTTPEnable : 0
  HTTPProxy : 127.0.0.1
  HTTPPort : 7897
  HTTPSEnable : 0
}
"#;

        assert_eq!(proxy_url_from_scutil(output), None);
    }

    fn unique_test_dir(label: &str) -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        env::temp_dir().join(format!(
            "sacred-seat-{label}-{}-{nonce}",
            std::process::id()
        ))
    }
}

#[tauri::command]
async fn organize_policies(request: OrganizeRequest) -> Result<String, String> {
    if request.mode != "simplify" && request.mode != "generate" {
        return Err("未知的 Codex 工作模式".to_string());
    }
    if request.mode == "generate" && request.goal.trim().is_empty() {
        return Err("请先写清楚底层最终目标".to_string());
    }

    tauri::async_runtime::spawn_blocking(move || {
        let policies = serde_json::to_string_pretty(&request.policies)
            .map_err(|error| format!("无法读取现有国策：{error}"))?;
        let task = if request.mode == "simplify" {
            r#"整理现有国策树：
- 输出整理后的完整国策树，而不是只给新增建议。
- 合并含义重复或高度相似的节点。
- 删除空泛、无法执行、对目标没有帮助的节点。
- 将冗长表述压缩成简洁、具体、可验证的行动。
- 修复不合理的上下层关系。
- operation 必须为 "replace"。"#
        } else {
            r#"从底层最终目标生成一条完整参考链：
- 必须包含用户给出的最终目标节点。
- 从最容易立即做到的小目标开始，逐层通向最终目标。
- 根据目标复杂度生成足够的节点，不设置固定数量上限。
- 如果一条链无法覆盖问题，可以生成多个并行分支。
- operation 必须为 "append"。"#
        };

        let prompt = format!(
            r#"你是一个负责整理 RSIP 国策树的助手。

工作模式：
{task}

用户补充或底层最终目标：
{goal}

现有国策：
{policies}

请遵守以下原则：
1. 每个节点就是一条简单、明确、可验证的国策，不再拆分名称、触发条件和规则。
2. 优先寻找负面状态形成之前的有效干预节点。
3. 优先被动或半被动、低维护成本、最差状态也能执行的规则。
4. 视觉上，上层是容易先实现的小目标，下层逐步通向最终目标。
5. parentTitle 表示“当前节点所服务的下层目标”的 content。最终目标的 parentTitle 必须为 null。
6. 不要生成含义重复的节点。
7. 只返回 JSON，不要 Markdown，不要解释。

严格使用下面的结构：
{{
  "operation": "replace 或 append",
  "summary": "一句简短说明",
  "nodes": [
    {{
      "content": "一条完整、可验证的国策内容",
      "parentTitle": "它所服务的下层目标 content；最终目标为 null"
    }}
  ]
}}"#,
            task = task,
            goal = request.goal.trim(),
            policies = policies
        );

        let codex = resolve_codex_launch()?;
        let mut child = Command::new(&codex.executable)
            .args([
                "exec",
                "--ephemeral",
                "--ignore-user-config",
                "--skip-git-repo-check",
                "--ignore-rules",
                "--sandbox",
                "read-only",
                "--color",
                "never",
                "-",
            ])
            .current_dir(std::env::temp_dir())
            .env("PATH", &codex.path_env)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|error| {
                format!(
                    "无法启动本机 Codex（{}）：{error}",
                    codex.executable.display()
                )
            })?;

        child
            .stdin
            .as_mut()
            .ok_or("无法向 Codex 发送内容")?
            .write_all(prompt.as_bytes())
            .map_err(|error| format!("发送内容失败：{error}"))?;

        let output = child
            .wait_with_output()
            .map_err(|error| format!("等待 Codex 失败：{error}"))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Codex 执行失败：{}", stderr.trim()));
        }

        extract_json(&String::from_utf8_lossy(&output.stdout))
    })
    .await
    .map_err(|error| format!("Codex 后台任务失败：{error}"))?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            organize_policies,
            system_proxy_url
        ])
        .run(tauri::generate_context!())
        .expect("error while running Dingshi");
}
