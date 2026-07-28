import { runWithFallback } from "./openrouter.js";

export interface RunRequest {
  systemPrompt: string;
  command: string;
  input?: string;
  // As personas foram escritas para um workflow humano-no-loop (fazem
  // perguntas de esclarecimento, pedem confirmação antes de prosseguir).
  // No pipeline automatizado não há humano para responder — sem este
  // aviso, o modelo (sobretudo os free/pequenos) degenera em "conversar"
  // sobre a fase anterior em vez de executar a sua ("Resposta: Sim,
  // procedemos com..."), observado em teste real encadeando as 5 fases.
  autoMode?: boolean;
}

const AUTO_MODE_PREFIX = `MODO PIPELINE AUTOMATIZADO — não há humano disponível para responder perguntas, confirmações ou pedidos de esclarecimento. Nunca pergunte, nunca peça confirmação, nunca escreva frases como "confirme se deseja..." ou "aguardando sua resposta". Execute o comando pedido e gere o artefato completo diretamente nesta resposta, adotando suposições razoáveis (e documentando-as) onde normalmente entrevistaria um humano.

---

`;

export interface RunResult {
  mode: "live" | "dry-run";
  provider?: "anthropic" | "openrouter";
  model?: string;
  output: string;
  fallbackAttempts?: { model: string; status: number }[];
}

const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-5";
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

function buildUserMessage(command: string, input?: string): string {
  return input ? `Comando: ${command}\n\n${input}` : `Comando: ${command}`;
}

async function runAnthropic(apiKey: string, systemPrompt: string, userMessage: string): Promise<RunResult> {
  const model = process.env.DABBA_LLM_MODEL ?? DEFAULT_ANTHROPIC_MODEL;
  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Anthropic error (${response.status}): ${body}`);
  }

  const data = (await response.json()) as { content: { type: string; text?: string }[] };
  const output = data.content
    .filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("\n");

  return { mode: "live", provider: "anthropic", model, output };
}

async function runOpenRouter(apiKey: string, systemPrompt: string, userMessage: string): Promise<RunResult> {
  const { model, output, attempts } = await runWithFallback(apiKey, systemPrompt, userMessage);
  return {
    mode: "live",
    provider: "openrouter",
    model,
    output,
    fallbackAttempts: attempts.map(({ model, status }) => ({ model, status })),
  };
}

export async function runAgentCommand(req: RunRequest): Promise<RunResult> {
  const userMessage = buildUserMessage(req.command, req.input);
  const systemPrompt = req.autoMode ? AUTO_MODE_PREFIX + req.systemPrompt : req.systemPrompt;
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  const anthropicKey = process.env.DABBA_LLM_API_KEY;
  const provider = process.env.DABBA_LLM_PROVIDER ?? (openRouterKey ? "openrouter" : anthropicKey ? "anthropic" : undefined);

  if (provider === "openrouter" && openRouterKey) {
    return runOpenRouter(openRouterKey, systemPrompt, userMessage);
  }
  if (provider === "anthropic" && anthropicKey) {
    return runAnthropic(anthropicKey, systemPrompt, userMessage);
  }

  return {
    mode: "dry-run",
    output: [
      "Nenhum provider LLM configurado (OPENROUTER_API_KEY ou DABBA_LLM_API_KEY) — nenhuma chamada de API foi feita.",
      "Prompt que seria enviado:",
      `--- system ---\n${systemPrompt}`,
      `--- user ---\n${userMessage}`,
    ].join("\n\n"),
  };
}
