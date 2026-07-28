# DABBA

**DABBA** — *Discovery, Architecture, Backlog and Business Analysis* — é a
identidade comercial do framework agentic **DPABB** (nome técnico interno,
preservado no código, nos pacotes e na documentação de arquitetura).

Produto desktop (app + GUI + conectores) que expõe o pipeline de agentes do
[DPABB-Framework](../DPABB-Framework) — Discovery, PRD, Architect, Backlog,
Business Case — como um "OpenWorker" próprio: um agente que roda localmente,
entrega artefatos reais (documentos, diagramas, backlog) e se conecta às
ferramentas que o usuário já usa.

Inspirado na arquitetura do [OpenWorker](https://github.com/andrewyng/openworker)
(desktop shell + agent server + conectores), adaptado para Node/TypeScript e
para o domínio de análise de requisitos técnicos do DPABB-Framework.

## Sub-marcas

| Nome | Papel |
|------|-------|
| **DABBA Studio** | Interface principal (este `gui/` + `desktop-shell/`) |
| **DABBA Agents** | Os 5 agentes especializados (Scout, Priya, Aria, Ben, Biz) |
| **DABBA Canvas** | Discovery visual (futuro) |
| **DABBA Architect** | Geração de arquitetura (mapeado ao agente `architect`) |
| **DABBA Business** | Business case e viabilidade (mapeado ao agente `business-case`) |

## Arquitetura

```
┌──────────────────────────────────────────────┐
│           desktop-shell (Tauri)               │  shell nativo + janela
├────────────────────────────────────────────────┤
│         DABBA Studio (React + Vite)           │  chat, pipeline, artefatos
├────────────────────────────────────────────────┤
│         agent-server (Node/TypeScript)         │  DABBA Agents · pipeline · memory
├───────────────┬────────────────┬───────────────┤
│  memory.md /  │   conectores    │  provider de  │
│  artefatos    │  (Jira, Slack…) │  modelo (BYOK)│
└───────────────┴────────────────┴───────────────┘
```

## Estrutura

| Diretório | Conteúdo |
|-----------|----------|
| `agent-server/` | Motor dos DABBA Agents (discovery, prd, architect, backlog, business-case), execução via LLM (BYOK), pipeline state, memory |
| `gui/` | DABBA Studio — interface React consumida pelo desktop-shell (e utilizável em browser durante o dev) |
| `desktop-shell/` | Shell Tauri que empacota a GUI e supervisiona o agent-server |
| `packaging/` | Scripts de build de instaladores (DMG, Windows) |
| `docs/` | Specs e decisões de arquitetura |

## Status

- ✅ `agent-server`: registry de agentes + execução de comandos via LLM (BYOK)
- ✅ `gui`: DABBA Studio consumindo o agent-server (lista de agentes, comandos, execução)
- 🚧 `desktop-shell`: shell Tauri inicializado, empacotamento ainda pendente
- Ver histórico de decisões em `docs/decisions.md`

## Rodando localmente

```bash
# 1. Agent server (porta 8765)
cd agent-server && npm install && npm run dev

# 2. DABBA Studio (browser, dev — porta 1420)
cd gui && npm install && npm run dev

# 3. Desktop app completo (requer Rust/cargo instalado)
cd desktop-shell && npm install && npm run tauri dev
```

### Configurando um provider de modelo (BYOK)

O `agent-server` executa comandos dos agentes chamando um provider LLM
compatível com a API de mensagens da Anthropic. Configure via variáveis de
ambiente antes de `npm run dev`:

```bash
export DABBA_LLM_API_KEY=sk-ant-...
export DABBA_LLM_MODEL=claude-sonnet-5   # opcional, tem default
```

Sem `DABBA_LLM_API_KEY` configurada, o endpoint de execução roda em modo
*dry-run*: retorna o prompt que seria enviado, sem chamar nenhuma API.
