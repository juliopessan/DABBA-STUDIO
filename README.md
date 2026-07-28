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
- ✅ Upload de RFP/documentos: PDF, DOCX, HTML, TXT/MD → extração de texto server-side
- ✅ Pipeline completo: Discovery → PRD → Architecture → Backlog → Business Case,
  persistido em SQLite, com documento HTML consolidado final
- 🚧 `desktop-shell`: shell Tauri inicializado, empacotamento ainda pendente
- Ver histórico de decisões em `docs/decisions.md`

## Pipeline completo (upload → 5 fases → relatório consolidado)

Na seção "Pipeline completo" da GUI (ou via API), anexe uma RFP e o
`agent-server` roda as 5 fases sequencialmente — cada uma usando o
artefato da fase anterior como premissa/contexto, na ordem documentada no
framework original:

1. `discovery` (`*start`)
2. `prd` (`*generate`)
3. `architecture` (`*design`)
4. `backlog` (`*breakdown`)
5. `business-case` (`*analyze`)

Cada artefato é salvo em `agent-server/data/dabba.sqlite` (tabelas
`pipeline_runs` e `phase_artifacts`). Ao final, um documento HTML
consolidado (todas as fases, conteúdo completo — não um resumo) é gerado
em `agent-server/data/output/{runId}.html`, estilizado com a identidade
visual da DABBA Studio, e servido em `GET /pipeline/:id/report.html`.

**API:**
- `POST /pipeline/run { projectName, rfpText }` — dispara o pipeline em
  background, retorna `runId` imediatamente
- `GET /pipeline/:id` — status + artefatos (para polling)
- `GET /pipeline/:id/report.html` — documento consolidado

**Upload de arquivos:** `POST /extract-text` (multipart, campo `file`)
aceita PDF, DOCX, HTML/HTM e TXT/MD, retornando o texto extraído.

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

O `agent-server` executa comandos dos agentes chamando um provider LLM.
Dois providers suportados, configuráveis via `agent-server/.env` (copie de
`.env.example`) ou variáveis de ambiente:

**OpenRouter (default, modelos free com fallback automático)**

```bash
OPENROUTER_API_KEY=sk-or-v1-...
# opcional: sobrescreve a lista/ordem de modelos free tentados
# DABBA_OPENROUTER_MODELS=nvidia/nemotron-nano-9b-v2:free,openai/gpt-oss-20b:free
```

Se um modelo free retornar erro, 429 (rate limit) ou quota estourada, o
`agent-server` tenta automaticamente o próximo da lista
(`agent-server/src/llm/openrouter.ts`). A resposta inclui `fallbackAttempts`
com os modelos que falharam antes do que respondeu — exibido na GUI.

**Anthropic (alternativa)**

```bash
DABBA_LLM_PROVIDER=anthropic
DABBA_LLM_API_KEY=sk-ant-...
DABBA_LLM_MODEL=claude-sonnet-5   # opcional, tem default
```

Sem nenhuma chave configurada, o endpoint de execução roda em modo
*dry-run*: retorna o prompt que seria enviado, sem chamar nenhuma API.
