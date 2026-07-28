// Um <a target="_blank"> normal não abre nada dentro da webview nativa do
// Tauri (sem popup de navegador do sistema por padrão) — precisa do
// plugin de shell para abrir no navegador padrão do SO. Em dev via
// browser comum (`npm run dev`, fora do Tauri), `@tauri-apps/plugin-shell`
// não está disponível, então cai para `window.open` normal.
export async function openExternal(url: string): Promise<void> {
  if ("__TAURI_INTERNALS__" in window) {
    const { open } = await import("@tauri-apps/plugin-shell");
    await open(url);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}
