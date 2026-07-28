import { isTauri } from "@tauri-apps/api/core";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";

export async function findAvailableUpdate(): Promise<Update | null> {
  if (!isTauri()) return null;
  return check();
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
