# DPABB-Framework-Desktop

Produto desktop (app + GUI + conectores) que expõe o pipeline de agentes do
[DPABB-Framework](../DPABB-Framework) — Discovery, PRD, Architect, Backlog,
Business Case — como um "OpenWorker" próprio: um agente que roda localmente,
entrega artefatos reais (documentos, diagramas, backlog) e se conecta às
ferramentas que o usuário já usa.

Inspirado na arquitetura do [OpenWorker](https://github.com/andrewyng/openworker)
(desktop shell + agent server + conectores), adaptado para Node/TypeScript e
para o domínio de análise de requisitos técnicos do DPABB-Framework.

## Arquitetura

```
┌──────────────────────────────────────────────┐
│           desktop-shell (Tauri)               │  shell nativo + janela
├────────────────────────────────────────────────┤
│              gui (React + Vite)               │  chat, pipeline, artefatos
├────────────────────────────────────────────────┤
│         agent-server (Node/TypeScript)         │  agentes · pipeline · memory
├───────────────┬────────────────┬───────────────┤
│  memory.md /  │   conectores    │  provider de  │
│  artefatos    │  (Jira, Slack…) │  modelo (BYOK)│
└───────────────┴────────────────┴───────────────┘
```

## Estrutura

| Diretório | Conteúdo |
|-----------|----------|
| `agent-server/` | Motor dos agentes (discovery, prd, architect, backlog, business-case), pipeline state, memory |
| `gui/` | Interface React consumida pelo desktop-shell (e utilizável em browser durante o dev) |
| `desktop-shell/` | Shell Tauri que empacota a GUI e supervisiona o agent-server |
| `packaging/` | Scripts de build de instaladores (DMG, Windows) |
| `docs/` | Specs e decisões de arquitetura |

## Status

Scaffold inicial — sem código funcional ainda. Ver `docs/decisions.md`.

## Rodando localmente (quando implementado)

```bash
# 1. Agent server
cd agent-server && npm install && npm run dev

# 2. GUI (browser, dev)
cd gui && npm install && npm run dev

# 3. Desktop app completo
cd desktop-shell && npm install && npm run tauri dev
```
