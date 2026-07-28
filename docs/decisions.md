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

## 2026-07-28 — Rebrand DABBA + execução via LLM + GUI + Tauri real

- **Rebrand:** produto comercial passa a se chamar **DABBA** (Discovery,
  Architecture, Backlog and Business Analysis). DPABB continua como nome
  técnico interno do framework de agentes. Sub-marcas definidas: DABBA
  Studio (GUI), DABBA Agents (os 5 agentes), DABBA Canvas (futuro), DABBA
  Architect e DABBA Business (mapeados aos agentes `architect` e
  `business-case`).
- **Execução via LLM (BYOK):** `agent-server/src/llm/provider.ts` chama a
  API de mensagens da Anthropic usando `persona` do agente como system
  prompt. Configurado via `DABBA_LLM_API_KEY` / `DABBA_LLM_MODEL`. Sem chave
  configurada, roda em modo `dry-run` (retorna o prompt sem chamar API) —
  permite testar o fluxo completo sem credenciais. Endpoint:
  `POST /agents/:id/run { command, input }`.
- **GUI (DABBA Studio):** reescrita para consumir `/agents` e
  `/agents/:id/run` de verdade — lista agentes, seleciona comando, roda e
  mostra o resultado (modo live/dry-run). Testado no browser via preview,
  incluindo CORS (precisou de middleware manual no Express).
- **Tauri real:** crate Rust gerado via `tauri init --ci --force`
  (Rust/rustup instalado via Homebrew, já existia parcialmente). Ajustes
  pós-geração: `productName`/`identifier` voltaram para valores DABBA,
  `beforeDevCommand`/`beforeBuildCommand` apontando para `../gui` (o init
  assume GUI na mesma pasta do `src-tauri`, o que não é o caso aqui), nome
  do crate/lib `dabba`/`dabba_lib`. Validado com `cargo check` e `tauri dev`
  de ponta a ponta — o binário nativo abriu e serviu a GUI a partir do Vite
  dev server.

## 2026-07-28 — UI/UX inspirada na Anthropic + Framer Motion

- **Paleta:** oat/cream de fundo (`#f5f4ed`), terracota como cor de destaque
  (`#d97757`), tinta escura para texto — inspirado na identidade visual da
  Anthropic/Claude, sem reutilizar assets proprietários.
- **Tipografia:** serif (Fraunces, via Google Fonts) para títulos/nomes de
  agente + sans-serif (Inter) para o resto — combinação editorial parecida
  com a usada pela Anthropic, sem copiar a fonte proprietária deles
  (Styrene/Tiempos).
- **Framer Motion:** grid de agentes com stagger de entrada, seleção com
  destaque terracota, painel de comando com fade/slide ao trocar de agente
  (`AnimatePresence mode="wait"`), pills de comando com transição suave,
  botão "Executar" com estado de loading (`ThinkingDots` — 3 pontos
  pulsando, referência direta à animação de "pensando" do Claude).
- Componentizado em `gui/src/components/{AgentGrid,CommandPanel,
  ThinkingDots}.tsx` — `App.tsx` ficou só orquestrando estado.
- Validado visualmente no browser: entrada com stagger, seleção de agente,
  troca de comando, execução em dry-run com badge de modo.
