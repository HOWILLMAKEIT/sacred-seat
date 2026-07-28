import { invoke } from "@tauri-apps/api/core";
import type { CodexMode, CodexSuggestion, PolicyNode } from "./types";

function fallbackSuggestion(mode: CodexMode, goal: string): CodexSuggestion {
  if (mode === "simplify") {
    return {
      operation: "replace",
      summary: "当前处于浏览器预览模式。正式 macOS 应用会调用本机 Codex 合并、精简并重排现有节点。",
      nodes: []
    };
  }

  return {
    operation: "append",
    summary: "当前处于浏览器预览模式，已使用本地规则生成草案。macOS 应用中将调用本机 Codex。",
    nodes: [
      {
        content: `记录一次导致“${goal}”失败的最早触发动作`,
        parentTitle: goal
      },
      {
        content: goal,
        parentTitle: null
      }
    ]
  };
}

export async function organizeWithCodex(
  mode: CodexMode,
  goal: string,
  policies: PolicyNode[]
): Promise<CodexSuggestion> {
  if (!("__TAURI_INTERNALS__" in window)) {
    return fallbackSuggestion(mode, goal);
  }

  const raw = await invoke<string>("organize_policies", {
    request: {
      mode,
      goal,
      policies
    }
  });
  const suggestion = JSON.parse(raw) as CodexSuggestion;
  return {
    ...suggestion,
    operation: mode === "simplify" ? "replace" : "append"
  };
}
