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

## 2026-07-28 — Integração OpenRouter com fallback de modelos free

- **Provider abstrato:** `agent-server/src/llm/provider.ts` agora escolhe
  entre `openrouter` e `anthropic` via `DABBA_LLM_PROVIDER` (default:
  openrouter se `OPENROUTER_API_KEY` presente, senão anthropic se
  `DABBA_LLM_API_KEY` presente, senão dry-run).
- **`agent-server/src/llm/openrouter.ts`:** lista de 8 modelos free
  (nvidia/nemotron, openai/gpt-oss-20b, google/gemma-4, etc.), tentados em
  ordem. Em erro retryable (429, 402, 404, 408, 5xx) tenta o próximo
  modelo automaticamente; erros não-retryable propagam imediatamente.
  Lista sobrescrevível via `DABBA_OPENROUTER_MODELS`.
- **Testado com chamadas reais** (não só dry-run): confirmado que
  `google/gemma-4-31b-it:free` retorna 429 no momento (rate-limited
  upstream) e que o fallback avança corretamente para
  `nvidia/nemotron-nano-9b-v2:free`, que responde. Testado também via GUI
  ponta a ponta — o agente `@discovery` (Scout) respondeu de verdade
  seguindo sua persona.
- **GUI:** `RunResult` ganhou `provider` e `fallbackAttempts`; o badge de
  resultado mostra `live · openrouter · <modelo>` e, quando houve
  fallback, uma linha listando os modelos que falharam antes do que
  respondeu.
- **Segredos:** chave da OpenRouter fica em `agent-server/.env` (git-
  ignorado, nunca commitado). `.env.example` documenta as variáveis sem
  valores reais.

## 2026-07-28 — Upload de documentos (PDF/DOCX/HTML/TXT)

- Extração de texto feita **server-side** (não no browser) para evitar a
  complexidade de bundlar `pdfjs-dist`/worker no Vite — `agent-server` usa
  `pdf-parse` (PDF), `mammoth` (DOCX), regex simples para strip de tags
  HTML, e passthrough para TXT/MD.
- `multer` (v2.x — a 1.x tem CVEs conhecidos, trocada explicitamente)
  com `memoryStorage` para o upload multipart, limite de 15MB.
- Endpoint `POST /extract-text`, testado com os 5 formatos usando
  arquivos reais gerados via `textutil`/`cupsfilter` (ferramentas nativas
  do macOS) — todos extraem corretamente. `.doc` (binário antigo) retorna
  415 com mensagem pedindo conversão para `.docx`.
- GUI: botão "Anexar arquivo" (ícone SVG próprio, sem lib de ícones) no
  `CommandPanel`, injeta o texto extraído no textarea de contexto.

## 2026-07-28 — Pipeline completo com persistência em SQLite

- **Motivação do usuário:** após upload da RFP, o fluxo deve rodar todas
  as fases (Discovery → PRD → Architecture → Backlog → Business Case)
  sequencialmente, cada uma usando o artefato da anterior como premissa,
  até um documento final consolidado.
- **Persistência:** `node:sqlite` (`DatabaseSync`) nativo do Node — sem
  dependência extra, evita problemas de compilação nativa do
  `better-sqlite3`. Banco em `agent-server/data/dabba.sqlite` (gitignored).
  Schema: `pipeline_runs` (run, status, project_name) e
  `phase_artifacts` (cada output de fase, com provider/model usados).
- **Ordem das fases e comandos:** segue exatamente o que já estava
  documentado no `CLAUDE.md` original do DPABB-Framework —
  `discovery *start` → `prd *generate` → `architect *design` →
  `backlog *breakdown` → `business-case *analyze`. Não inventei uma nova
  sequência; reaproveitei a que o framework já definia.
- **Execução em background:** `POST /pipeline/run` cria o run e dispara o
  processamento assíncrono sem bloquear a resposta HTTP (retorna
  `runId` na hora); GUI faz polling em `GET /pipeline/:id` a cada 3s.
- **Documento consolidado:** `agent-server/src/pipeline/htmlReport.ts`
  gera um HTML standalone com o mesmo tema visual da DABBA Studio (oat +
  terracota + Fraunces/Inter), TOC com âncoras, uma seção por fase com o
  **conteúdo completo** de cada artefato (não um resumo).
- **Markdown → HTML:** conversor próprio em `pipeline/markdown.ts` (sem
  lib externa) — cobre headers, negrito/itálico, código, listas,
  parágrafos e `---` como `<hr>`. **Bug encontrado e corrigido durante
  teste real:** quando o modelo envolve a resposta inteira num bloco
  ` ```markdown ` (às vezes com preâmbulo/posfácio soltos fora do fence,
  ex: "Se quiser ajustar, posso refinar! 😊"), o parser tratava tudo como
  código literal. Corrigido detectando o conteúdo entre o primeiro e o
  último marcador de fence quando isso cobre >50% do texto — descarta a
  conversa em volta, preserva blocos de código curtos legítimos.
- **Testado de ponta a ponta com chamadas reais** (RFP de exemplo sobre
  sistema de estoque para varejo): as 5 fases rodaram via OpenRouter,
  cada uma referenciando o contexto da anterior, run salvo em SQLite,
  HTML consolidado gerado e validado visualmente no browser (título,
  TOC, formatação de cada seção, incluindo depois do fix do bug acima).
- `agent-server/scripts/regenerate-report.ts`: utilitário para regenerar
  o HTML de um run já persistido sem re-rodar os LLMs (usado para validar
  o fix do markdown sem gastar chamadas novamente).

## 2026-07-28 — Fix: fase Architecture renderizando como código literal

- **Sintoma reportado pelo usuário:** documento consolidado real (run do
  usuário, RFP "SmallProjectScopeRFP") saindo com "muito markdown" visível
  em vez de HTML limpo — a seção Architecture inteira virou um bloco de
  código monoespaçado (0 headers, 0 negrito renderizado).
- **Causa raiz:** a fase Architecture gera vários diagramas
  ` ```mermaid ` legítimos (um por fase do TOGAF ADM). A heurística de
  "desembrulhar fence externo" (adicionada para o bug do business-case)
  pegava o **primeiro e o último marcador de fence do documento inteiro**
  — nesse caso isso capturou a abertura do 1º diagrama e o fechamento do
  8º, quebrando o pareamento de todos os fences no meio. O restante do
  parser ficou com o estado de "dentro de bloco de código" dessincronizado
  e engoliu quase tudo como `<pre>`.
- **Fix:** a heurística agora só dispara quando há **exatamente 2**
  marcadores de fence no documento inteiro (ou seja, a resposta inteira é
  literalmente 1 bloco único) — `agent-server/src/pipeline/markdown.ts`.
  Documentos com múltiplos blocos de código reais (>2 marcadores) não são
  tocados; cada fence é processado individualmente pelo parser normal.
- **Validado:** regenerado o HTML do run real do usuário
  (`c47e82df-ba4d-4e68-82d4-28ad02f7b9e3`) sem re-rodar os LLMs (via
  `scripts/regenerate-report.ts`) — confirmado headers/negrito voltando a
  aparecer em todas as 5 fases, e os 8 diagramas Mermaid da Architecture
  continuam corretamente isolados em blocos `<pre>`.

## 2026-07-28 — Reescrita do parser de markdown: tabelas e listas aninhadas

- **Feedback do usuário** (com o texto renderizado da página colado):
  tabelas GFM (`| a | b |`) apareciam como pipes literais, listas
  aninhadas (ex: `- Regulatory:\n  - sub-item`) viravam bullets duplicados
  e texto solto, e listas numeradas (`1. item`) não eram convertidas.
- **Reescrita completa** de `agent-server/src/pipeline/markdown.ts`:
  - Tabelas GFM: detecta linha de cabeçalho `|...|` seguida de separador
    (`|---|---|`), renderiza `<table><thead>...<tbody>`.
  - Listas: pilha (`ListFrame[]`) rastreando indentação de cada nível,
    suporta aninhamento real (`<ul>`/`<ol>` dentro de `<li>`), listas
    ordenadas (`1.`/`1)`) viram `<ol>`, e linhas de continuação indentadas
    sem marcador são anexadas ao item de lista aberto em vez de virarem
    parágrafo solto.
  - CSS: estilos de tabela adicionados em `htmlReport.ts` (bordas,
    header destacado com Fraunces, `<hr>` sutil).
- **Validado no run real do usuário** (`c47e82df...`, RFP
  "SmallProjectScopeRFP") via `regenerate-report.ts` — tabelas de
  stakeholders, riscos e alternativas renderizando com bordas corretas;
  listas aninhadas (critérios de aceitação Given/Quando/Then dentro de
  cada story do Backlog) com marcadores diferentes por nível; listas
  numeradas dos "Próximos Passos" como `<ol>` de verdade.

## 2026-07-28 — Refinamento de UI/UX: ícones, animações e dark mode

- **Sistema de ícones próprio** (`gui/src/components/icons.tsx`): SVG inline,
  zero dependência externa (importante porque o app roda numa webview
  Tauri sem CDN). Um ícone por agente, escolhido pela metáfora do papel:
  bússola (@discovery), documento com linhas (@prd), camadas empilhadas
  (@architect), colunas kanban (@backlog), gráfico de barras
  (@business-case) — dá reconhecimento visual instantâneo no grid e na
  timeline. Mais ícones de UI (upload, arquivo, play, link externo,
  alerta, sol/lua).
- **Dark mode** (`useTheme.ts` + `data-theme` no `<html>`): paleta escura
  quente derivada da clara, persistida em `localStorage`, com fallback
  para `prefers-color-scheme`.
- **Bug real encontrado e corrigido — `color-scheme` ausente:** sem a
  declaração, webviews/navegadores com *forced dark mode* aplicavam o
  escurecimento automático deles POR CIMA da paleta clara, quebrando o
  tema. Diagnosticado ao ver `data-theme="light"` no DOM mas a página
  renderizando escura. Corrigido declarando `color-scheme: light|dark`
  por tema — relevante para o app Tauri em máquinas com OS escuro.
- **Robustez de animação (decisão de arquitetura):** durante o teste,
  descobri que o conteúdo principal ficava em `opacity: 0.017` — travado
  no meio da animação de entrada — quando o `requestAnimationFrame` era
  suspenso (janela/aba em segundo plano). Num app desktop isso significa
  minimizar e restaurar podendo revelar uma tela em branco. **Regra
  adotada:** entradas de conteúdo principal (header, card do pipeline,
  cards de agente, painel de comando) animam **apenas transform**, nunca
  opacidade — se a animação congelar, o pior caso é alguns pixels de
  deslocamento, jamais conteúdo invisível. Fades ficam restritos a UI
  efêmera/condicional (resultados, erros, badges, saída do
  `AnimatePresence`), onde congelar é inofensivo. Verificado: com o
  painel oculto e rAF suspenso, `opacity` permaneceu 1 e o transform
  congelou a 0.14px do destino.
- **Micro-interações com Framer Motion:**
  - `layoutId` compartilhado no anel de seleção do agente e na pill de
    comando ativa — o indicador desliza entre os alvos em vez de piscar,
    deixando óbvio de onde para onde a seleção foi.
  - `PhaseTimeline`: trilho vertical cujo preenchimento cresce por fase,
    nó ativo com pulso irradiando, checkmark desenhado via `pathLength`
    quando a fase conclui, e o modelo usado aparecendo embaixo.
  - Progresso do pipeline em % + cronômetro no cabeçalho do card.
  - Botão primário com gradiente e brilho que atravessa no hover
    (via `variants` — `whileHover` no pai só propaga para filhos que
    declaram variants).
- **Drag-and-drop de arquivo** (`useFileDrop.ts`) nas duas áreas de
  texto, com overlay tracejado; o contador de profundidade evita o
  flicker clássico de `dragleave` ao passar sobre elementos filhos.
- **Acessibilidade:** `aria-label` + `aria-pressed` nos cards de agente
  (a árvore de acessibilidade os mostrava sem nome), `:focus-visible`
  com anel próprio, e `prefers-reduced-motion` desligando as animações.
- **Bug de empilhamento corrigido:** a pill de comando ativa usava
  `zIndex: -1`, que a jogava para trás do card inteiro em vez de para
  trás do texto — o fundo gradiente ficava invisível. Corrigido elevando
  o rótulo com um `<span>` relativo.
- Validado no browser: tema claro e escuro, seleção de agente, pill
  deslizante, upload com chip do arquivo, e um pipeline real do início
  ao fim mostrando a timeline avançando fase a fase.
