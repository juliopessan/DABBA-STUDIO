import { getAgent } from "../agents/registry.js";
import { runAgentCommand } from "../llm/provider.js";
import { createRun, saveArtifact, updateRunStatus, getArtifacts, getRun, type PipelineRun } from "../db/sqlite.js";
import { buildConsolidatedReport } from "./htmlReport.js";
import { unwrapOuterCodeFence } from "./markdown.js";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { OUTPUT_DIR } from "../appPaths.js";

// Ordem oficial do pipeline DABBA (Discovery → PRD → Architect → Backlog →
// Business Case), documentada no CLAUDE.md do framework original — cada
// fase usa o(s) comando(s) de geração do agente e recebe o artefato da fase
// anterior como premissa/contexto.
//
// Backlog encadeia 3 comandos (não 1): modelos free tendem a esquecer
// seções quando um único prompt pede Epics + Effort Estimation + Staffing
// de uma vez (testado: nvidia/nemotron-nano-9b ignorou as duas últimas
// seções mesmo com instrução explícita). Pedir cada seção como um comando
// separado, encadeado, é bem mais confiável do que um mega-prompt.
export const PIPELINE_STEPS = [
  { phase: "discovery", agentId: "discovery", commands: ["*start"] },
  { phase: "prd", agentId: "prd", commands: ["*generate"] },
  { phase: "architecture", agentId: "architect", commands: ["*design"] },
  { phase: "backlog", agentId: "backlog", commands: ["*breakdown", "*estimate", "*staffing"] },
  { phase: "business-case", agentId: "business-case", commands: ["*analyze"] },
] as const;

// Cria o run e dispara o processamento em background (não bloqueia a
// resposta HTTP) — o cliente acompanha via polling em GET /pipeline/:id.
export function startPipeline(projectName: string, rfpText: string): PipelineRun {
  const run = createRun(projectName);
  processPipeline(run.id, rfpText).catch((err) => {
    console.error(`pipeline ${run.id} falhou:`, err);
  });
  return run;
}

async function processPipeline(runId: string, rfpText: string): Promise<void> {
  let carriedInput = rfpText;

  for (const step of PIPELINE_STEPS) {
    const agent = getAgent(step.agentId);
    if (!agent) {
      updateRunStatus(runId, "failed");
      throw new Error(`agente não encontrado no registry: ${step.agentId}`);
    }

    // Dentro da fase, cada comando recebe TODAS as saídas acumuladas dos
    // comandos anteriores da mesma fase (não só a do imediatamente
    // anterior) — o *staffing precisa enxergar o *breakdown (volume de
    // stories por especialidade) e o *estimate (pontos/sprints) juntos,
    // não apenas o resumo do *estimate isolado.
    let phaseInput = carriedInput;
    const sections: string[] = [];
    let lastProvider: string | undefined;
    let lastModel: string | undefined;

    for (const command of step.commands) {
      let result;
      try {
        result = await runAgentCommand({ systemPrompt: agent.persona, command, input: phaseInput, autoMode: true });
      } catch (error) {
        updateRunStatus(runId, "failed");
        throw error;
      }
      // Desembrulha o fence externo (se houver) ANTES de concatenar — cada
      // comando gera sua própria resposta com seu próprio fence individual;
      // se concatenássemos primeiro, o texto combinado teria múltiplos
      // pares de fence e a heurística de desembrulho (que só age com
      // exatamente 1 par) deixaria de disparar para qualquer uma delas.
      sections.push(unwrapOuterCodeFence(result.output));
      phaseInput = sections.join("\n\n");
      lastProvider = result.provider;
      lastModel = result.model;
    }

    const combinedOutput = sections.join("\n\n");
    saveArtifact(runId, step.phase, step.agentId, step.commands.join(" → "), combinedOutput, lastProvider, lastModel);
    carriedInput = combinedOutput;
  }

  const run = getRun(runId);
  if (!run) throw new Error(`run não encontrado após processamento: ${runId}`);
  const artifacts = getArtifacts(runId);
  const html = buildConsolidatedReport(run, artifacts);

  const reportPath = path.join(OUTPUT_DIR, `${runId}.html`);
  writeFileSync(reportPath, html, "utf-8");
  updateRunStatus(runId, "done", reportPath);
}
