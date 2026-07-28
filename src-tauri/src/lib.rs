use serde::Deserialize;
use serde_json::Value;
use std::io::Write;
use std::process::{Command, Stdio};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OrganizeRequest {
    mode: String,
    goal: String,
    policies: Value,
}

fn codex_binary() -> String {
    for candidate in ["/opt/homebrew/bin/codex", "/usr/local/bin/codex", "codex"] {
        if candidate == "codex" || std::path::Path::new(candidate).exists() {
            return candidate.to_string();
        }
    }
    "codex".to_string()
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

        let mut child = Command::new(codex_binary())
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
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|error| format!("无法启动本机 Codex：{error}"))?;

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
        .invoke_handler(tauri::generate_handler![organize_policies])
        .run(tauri::generate_context!())
        .expect("error while running Dingshi");
}
