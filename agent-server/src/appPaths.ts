import { mkdirSync } from "node:fs";
import path from "node:path";
import os from "node:os";

// When packaged (SEA/sidecar) there is no source-relative __dirname and no
// predictable cwd — data and config must live somewhere stable for the user,
// following each OS's convention, not next to the executable (which may sit
// inside a read-only .app bundle).
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
