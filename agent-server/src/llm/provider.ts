export interface RunRequest {
  systemPrompt: string;
  command: string;
  input?: string;
}

export interface RunResult {
  mode: "live" | "dry-run";
  model?: string;
  output: string;
}

const DEFAULT_MODEL = "claude-sonnet-5";
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

function buildUserMessage(command: string, input?: string): string {
  return input ? `Comando: ${command}\n\n${input}` : `Comando: ${command}`;
}

export async function runAgentCommand(req: RunRequest): Promise<RunResult> {
  const apiKey = process.env.DABBA_LLM_API_KEY;
  const model = process.env.DABBA_LLM_MODEL ?? DEFAULT_MODEL;
  const userMessage = buildUserMessage(req.command, req.input);

  if (!apiKey) {
    return {
      mode: "dry-run",
      output: [
        "DABBA_LLM_API_KEY não configurada — nenhuma chamada de API foi feita.",
        "Prompt que seria enviado:",
        `--- system ---\n${req.systemPrompt}`,
        `--- user ---\n${userMessage}`,
      ].join("\n\n"),
    };
  }

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
      system: req.systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`LLM provider error (${response.status}): ${body}`);
  }

  const data = (await response.json()) as {
    content: { type: string; text?: string }[];
  };
  const output = data.content
    .filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("\n");

  return { mode: "live", model, output };
}
