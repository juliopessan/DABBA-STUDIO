# Decisões de Arquitetura

## 2026-07-28 — Criação do projeto

- **Origem:** DPABB-Framework (pipeline AIOS de análise de requerimentos) vira
  a base de um produto desktop, inspirado no OpenWorker (andrewyng/openworker).
- **Escopo:** app desktop do zero, sem reutilizar código do OpenWorker
  (apenas a ideia de arquitetura: shell + agent server + GUI + conectores).
- **Localização:** repositório novo e independente, `~/DPABB-Framework-Desktop`,
  irmão do `DPABB-Framework` original.
- **Stack:** Tauri (shell nativo) + React (GUI) + Node/TypeScript (agent-server),
  em vez de Python — para ficar alinhado ao restante do ecossistema AIOS,
  que já é JS/TS.
- **Agentes:** reaproveitam a lógica/personas já definidas em
  `DPABB-Framework/CLAUDE.md` (@discovery, @prd, @architect, @backlog,
  @business-case), portadas para módulos TypeScript no agent-server.
- **Pendente de decisão:** modelo de conectores (MCP vs. integrações diretas),
  estratégia de auto-update, code signing.

## 2026-07-28 — Registry de agentes

- Personas dos 5 agentes copiadas de `DPABB-Framework/agents/*.md` para
  `agent-server/personas/*.md` — cópia própria, sem depender de caminho
  externo ao repositório (produto agora é independente).
- `agent-server/src/agents/loader.ts` faz parsing genérico do markdown
  (cabeçalho `# @id — Nome` e lista de comandos em `## Comandos`) em vez de
  hardcodar cada agente — evita duplicação e ficar defasado se a persona
  mudar.
- Endpoints expostos: `GET /health`, `GET /agents`, `GET /agents/:id`.
- Ainda não implementado: execução real de comandos (`*start`, `*generate`,
  etc.) via LLM — por enquanto o server só serve a persona/metadados.
