const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

// Ordem de preferência: modelos generalistas e mais estáveis primeiro.
// Sobrescrevível via DABBA_OPENROUTER_MODELS (lista separada por vírgula).
export const DEFAULT_FREE_MODELS = [
  "nvidia/nemotron-nano-9b-v2:free",
  "openai/gpt-oss-20b:free",
  "nvidia/nemotron-3-nano-30b-a3b:free",
  "google/gemma-4-31b-it:free",
  "google/gemma-4-26b-a4b-it:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
  "inclusionai/ling-3.0-flash:free",
  "openrouter/free",
];

export function getFreeModelList(): string[] {
  const override = process.env.DABBA_OPENROUTER_MODELS;
  if (!override) return DEFAULT_FREE_MODELS;
  return override
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
}

export interface OpenRouterAttempt {
  model: string;
  status: number;
  error: string;
}

export interface OpenRouterResult {
  model: string;
  output: string;
  attempts: OpenRouterAttempt[];
}

// Erros que justificam tentar o próximo modelo da lista (indisponibilidade
// temporária ou de conta), em vez de propagar o erro imediatamente.
const RETRYABLE_STATUS = new Set([429, 402, 404, 408, 500, 502, 503, 504]);

export async function runWithFallback(
  apiKey: string,
  systemPrompt: string,
  userMessage: string,
  models: string[] = getFreeModelList()
): Promise<OpenRouterResult> {
  const attempts: OpenRouterAttempt[] = [];

  for (const model of models) {
    const response = await fetch(OPENROUTER_API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      attempts.push({ model, status: response.status, error: body });
      if (RETRYABLE_STATUS.has(response.status)) continue;
      throw new Error(`OpenRouter error on ${model} (${response.status}): ${body}`);
    }

    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
      error?: { message?: string };
    };

    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      attempts.push({ model, status: response.status, error: data.error?.message ?? "empty response" });
      continue;
    }

    return { model, output: content, attempts };
  }

  const summary = attempts.map((a) => `${a.model} (${a.status})`).join(", ");
  throw new Error(`Todos os modelos free da OpenRouter falharam: ${summary}`);
}
