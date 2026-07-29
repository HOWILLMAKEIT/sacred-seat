import { invoke, isTauri } from "@tauri-apps/api/core";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";

const UPDATE_TIMEOUT_MS = 12_000;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function findAvailableUpdate(): Promise<Update | null> {
  if (!isTauri()) return null;

  const proxy = await invoke<string | null>("system_proxy_url").catch(() => null);
  if (!proxy) {
    return check({ timeout: UPDATE_TIMEOUT_MS });
  }

  try {
    return await check({ proxy, timeout: UPDATE_TIMEOUT_MS });
  } catch (proxyError) {
    try {
      return await check({ timeout: UPDATE_TIMEOUT_MS });
    } catch (directError) {
      throw new Error(
        `系统代理与直连均无法检查更新。代理：${errorMessage(proxyError)}；直连：${errorMessage(directError)}`
      );
    }
  }
}

export async function installAvailableUpdate(
  update: Update,
  onProgress: (progress: number | null) => void
): Promise<void> {
  let downloaded = 0;
  let total: number | undefined;

  await update.downloadAndInstall((event) => {
    if (event.event === "Started") {
      total = event.data.contentLength;
      onProgress(total ? 0 : null);
      return;
    }

    if (event.event === "Progress") {
      downloaded += event.data.chunkLength;
      onProgress(total ? Math.min(100, Math.round((downloaded / total) * 100)) : null);
      return;
    }

    onProgress(100);
  });

  await relaunch();
}
