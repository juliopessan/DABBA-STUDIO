import { mkdirSync } from "node:fs";
import path from "node:path";
import os from "node:os";

// Empacotado (SEA/sidecar) não tem __dirname relativo ao source nem um
// cwd previsível — dados e config precisam viver num lugar estável do
// usuário, seguindo a convenção de cada SO, não ao lado do executável
// (que pode estar dentro de um .app bundle somente-leitura).
function resolveAppDataDir(): string {
  const home = os.homedir();
  if (process.platform === "darwin") return path.join(home, "Library", "Application Support", "DABBA");
  if (process.platform === "win32") return path.join(process.env.APPDATA ?? home, "DABBA");
  return path.join(home, ".dabba");
}

export const APP_DATA_DIR = resolveAppDataDir();
export const DATA_DIR = path.join(APP_DATA_DIR, "data");
export const OUTPUT_DIR = path.join(DATA_DIR, "output");
export const ENV_FILE = path.join(APP_DATA_DIR, ".env");

mkdirSync(OUTPUT_DIR, { recursive: true });
