import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PERSONAS_DIR = path.resolve(__dirname, "../../personas");

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

export function loadAgents(): Agent[] {
  return readdirSync(PERSONAS_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((f) => {
      const id = f.replace(/\.md$/, "");
      const content = readFileSync(path.join(PERSONAS_DIR, f), "utf-8");
      return parseAgent(id, content);
    });
}
