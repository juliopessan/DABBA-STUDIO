// A plain <a target="_blank"> opens nothing inside Tauri's native webview
// (no system browser popup by default) — it needs the shell plugin to open
// in the OS default browser. In plain-browser dev (`npm run dev`, outside
// Tauri) `@tauri-apps/plugin-shell` isn't available, so fall back to
// ordinary `window.open`.
export async function openExternal(url: string): Promise<void> {
  if ("__TAURI_INTERNALS__" in window) {
    const { open } = await import("@tauri-apps/plugin-shell");
    await open(url);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}
