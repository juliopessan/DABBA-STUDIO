import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

export interface Agent {
  id: string;
  name: string;
  commands: string[];
  persona: string;
}

function parseAgent(id: string, content: string): Agent {
  const header = content.match(/^# @([\w-]+) — (.+)$/m);
  const name = header?.[2]?.trim() ?? id;

  const commandsBlock = content.match(/## Commands\n([\s\S]*?)\n##/);
  // Only the first occurrence of each command counts as its definition; any
  // later cross-reference in backticks (e.g. "output of `*breakdown`" inside
  // another command's description) is ignored rather than duplicating the
  // entry in the agent's command list.
  const commands = commandsBlock
    ? [...new Set([...commandsBlock[1].matchAll(/`(\*[\w-]+)`/g)].map((m) => m[1]))]
    : [];

  return { id, name, commands, persona: content };
}

// Packaged as a Node SEA (Tauri sidecar) there is no "file next to the
// source" to locate via import.meta.url/__dirname — the executable is a single
// blob. The personas become *assets* embedded in the binary (see
// scripts/build-sidecar.mjs), read through the `node:sea` builtin.
// `import("node:sea")` is dynamic so it doesn't break the CJS bundle (Node's
// SEA config requires CJS; `import.meta` does not survive the conversion).
async function loadAgentsFromSeaAssets(): Promise<Agent[]> {
  const sea = await import("node:sea");
  const manifest = JSON.parse(sea.getAsset("personas-manifest.json", "utf8")) as string[];
  return manifest.map((id) => {
    const content = sea.getAsset(`persona-${id}.md`, "utf8");
    return parseAgent(id, content);
  });
}

function loadAgentsFromDisk(): Agent[] {
  // In dev (tsx) and in a plain tsc build, personas/ sits two folders above
  // the compiled file (agent-server/personas), resolved from the process cwd
  // (agent-server/), which is how `npm run dev` and `npm start` are always
  // invoked in this project.
  const personasDir = path.resolve(process.cwd(), "personas");
  return readdirSync(personasDir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => {
      const id = f.replace(/\.md$/, "");
      const content = readFileSync(path.join(personasDir, f), "utf-8");
      return parseAgent(id, content);
    });
}

export async function loadAgents(): Promise<Agent[]> {
  const sea = await import("node:sea").catch(() => null);
  if (sea?.isSea()) return loadAgentsFromSeaAssets();
  return loadAgentsFromDisk();
}
