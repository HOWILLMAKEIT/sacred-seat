import { isTauri } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { MouseEvent } from "react";

export async function openExternalUrl(url: string): Promise<void> {
  if (isTauri()) {
    await openUrl(url);
    return;
  }

  window.open(url, "_blank", "noopener,noreferrer");
}

export function openExternalLink(event: MouseEvent<HTMLAnchorElement>): void {
  event.preventDefault();
  void openExternalUrl(event.currentTarget.href);
}
