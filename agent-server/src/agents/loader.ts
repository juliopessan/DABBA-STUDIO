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

  const commandsBlock = content.match(/## Comandos\n([\s\S]*?)\n##/);
  // Só a primeira ocorrência de cada comando conta como definição; qualquer
  // referência cruzada subsequente entre crases (ex.: "saída do `*breakdown`"
  // dentro da descrição de outro comando) é ignorada em vez de duplicar a
  // entrada na lista de comandos do agente.
  const commands = commandsBlock
    ? [...new Set([...commandsBlock[1].matchAll(/`(\*[\w-]+)`/g)].map((m) => m[1]))]
    : [];

  return { id, name, commands, persona: content };
}

// Empacotado como Node SEA (sidecar Tauri), não existe um "arquivo ao lado
// do source" para localizar via import.meta.url/__dirname — o executável é
// um blob único. As personas viram *assets* embutidos no binário (ver
// scripts/build-sidecar.mjs), lidos via o módulo builtin `node:sea`.
// `import("node:sea")` é feito dinamicamente para não quebrar o bundle CJS
// (o SEA config do Node exige CJS; `import.meta` não sobrevive à conversão).
async function loadAgentsFromSeaAssets(): Promise<Agent[]> {
  const sea = await import("node:sea");
  const manifest = JSON.parse(sea.getAsset("personas-manifest.json", "utf8")) as string[];
  return manifest.map((id) => {
    const content = sea.getAsset(`persona-${id}.md`, "utf8");
    return parseAgent(id, content);
  });
}

function loadAgentsFromDisk(): Agent[] {
  // Em dev (tsx) e no build tsc tradicional, personas/ fica duas pastas
  // acima do arquivo compilado (agent-server/personas), resolvida a partir
  // do cwd do processo (agent-server/), que é como `npm run dev` e
  // `npm start` sempre são invocados neste projeto.
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
