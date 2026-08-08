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

## 2026-07-28 — Fix: Backlog sem Effort Estimation nem Staffing Plan

- **Feedback do usuário** (output real colado): a fase Backlog só trazia
  Epics/Stories — faltavam a estimativa de esforço consolidada (rollup de
  pontos, sprints, prazo) e o plano de staffing (papéis, quantidade,
  alocação).
- **Causa raiz:** o pipeline chamava só `*breakdown` para a fase Backlog.
  Pedir tudo (Epics + Effort Estimation + Staffing) num único prompt para
  o modelo free (`nvidia/nemotron-nano-9b-v2:free`) resultava no modelo
  ignorando as duas últimas seções — testado e confirmado antes do fix.
- **Fix — encadear comandos em vez de um mega-prompt:** `PIPELINE_STEPS`
  em `orchestrator.ts` passou de `command: string` para
  `commands: string[]`; a fase Backlog agora chama
  `*breakdown → *estimate → *staffing` em sequência, cada comando
  recebendo a concatenação de TODAS as saídas anteriores da fase (não só
  a do comando imediatamente anterior) — o `*staffing` precisa ver o
  volume de stories do `*breakdown` junto com os pontos do `*estimate`
  para dimensionar papéis de verdade, não um número arbitrário.
- **Persona `backlog.md`** (sincronizada entre `DPABB-Framework-Desktop/
  agent-server/personas/` e `DPABB-Framework/agents/`, que devem ficar
  idênticas): `*estimate` redefinido para gerar só a seção Effort
  Estimation consolidada; `*staffing` é um comando novo para o Plano de
  Staffing. Regra explícita adicionada: nunca envolver o documento inteiro
  num bloco de código.
- **Dois bugs reais encontrados durante o teste, ambos corrigidos:**
  1. A descrição do `*estimate` referenciava `` `*breakdown` `` entre
     crases — o parser do loader (`agents/loader.ts`) captura qualquer
     `` `*palavra` `` dentro do bloco `## Comandos` como definição de
     comando, então essa referência cruzada duplicava `*breakdown` na
     lista de comandos do agente (visível como pill repetida na GUI).
     Corrigido removendo as crases da referência cruzada, e o loader
     ganhou um `Set` de defesa (`loader.ts`) para nunca mais duplicar,
     mesmo que uma futura persona cometa o mesmo erro.
  2. Ao concatenar as 3 saídas (`*breakdown` + `*estimate` + `*staffing`)
     antes de rodar o parser de markdown, o texto combinado tinha 6
     marcadores de fence (2 por resposta, cada uma vinha embrulhada no
     seu próprio ` ```markdown `) — a heurística de desembrulho (que só
     age com exatamente 2 marcadores no documento inteiro) parava de
     disparar, e as 3 seções viravam blocos de código literais. Corrigido
     exportando `unwrapOuterCodeFence` de `markdown.ts` e aplicando-a a
     cada seção individualmente ANTES de concatenar, tanto no que é salvo
     no SQLite quanto no que é passado como contexto para o próximo
     comando da fase.
- Tabelas ganharam um wrapper `.table-wrap` com `overflow-x: auto` —
  a coluna "Justificativa" do Plano de Staffing tem texto longo o
  suficiente para esticar a tabela além da largura do documento.
- **Validado com chamadas reais** (não mockadas): rodei `*breakdown`,
  depois `*estimate` recebendo o breakdown como contexto, depois
  `*staffing` recebendo breakdown+estimate acumulados — a tabela de
  staffing saiu dimensionada a partir do volume real de stories
  ("70% das stories backend"), não um número arbitrário. Renderizei o
  relatório consolidado real (via `GET /pipeline/:id/report.html`,
  inserindo um run de teste no SQLite) e confirmei via inspeção do DOM:
  headers "Effort Estimation" e "Plano de Staffing" presentes, 2 tabelas
  renderizadas, 0 blocos `<pre>` residuais, nenhum fence vazando como
  texto literal.

## 2026-07-28 — agent-server como sidecar Tauri (Node SEA)

- **Motivação:** até aqui, "usar o app" exigia rodar `npm run dev:server`
  manualmente num terminal, além de abrir a GUI — não é a experiência de
  duplo-clique de um app Mac de verdade. Perguntei ao usuário como prefere
  resolver a supervisão do backend; escolheu sidecar Tauri (o padrão
  recomendado pelo próprio Tauri para esse cenário).
- **Empacotamento — Node SEA (Single Executable Application):** o
  `agent-server` (Express + node:sqlite + LLM providers) vira um binário
  standalone via `agent-server/scripts/build-sidecar.mjs`:
  1. `esbuild` bundla tudo num único `bundle.cjs`
  2. `node --experimental-sea-config` gera o blob SEA
  3. o blob é injetado (via `postject`) numa cópia do binário do Node
  4. no macOS, a assinatura precisa ser removida antes da injeção e
     re-assinada (ad-hoc) depois — alterar o binário invalida a assinatura
     original.
  5. o resultado vai para `desktop-shell/src-tauri/binaries/agent-server-<target-triple>`,
     a convenção de nome que o Tauri exige para sidecars.
- **Bug real descoberto durante o teste:** o binário do Node do sistema
  (Homebrew, neste caso) é linkado dinamicamente contra dylibs do próprio
  gerenciador de pacotes (`libnode.141.dylib`, openssl, icu4c, sqlite…) em
  caminhos absolutos daquela máquina — copiar esse binário funciona *só
  ali*, mas quebraria em qualquer outra máquina onde o app fosse
  instalado. Confirmado via `otool -L` (dezenas de dependências
  Homebrew) vs. o binário oficial do nodejs.org (só frameworks do
  próprio macOS). Corrigido: o script baixa e cacheia o binário oficial
  estático (`nodejs.org/dist/vX/node-vX-darwin-arm64.tar.gz`) e usa
  **esse** como base para a injeção, nunca o Node local de dev.
- **`import.meta.url` não sobrevive ao bundle CJS:** SEA exige um entry
  point CJS; `import.meta` vira `{}` nesse formato (o esbuild avisa,
  "empty-import-meta"), quebrando qualquer `fileURLToPath(import.meta.url)`
  usado para localizar arquivos relativos ao módulo — e o agent-server
  usava isso em `agents/loader.ts` para achar `personas/`. Além disso, um
  executável SEA é um blob único: não há "pasta ao lado" no disco para
  ler `personas/*.md` de qualquer forma, mesmo sem o problema do
  `import.meta`.
  - **Fix:** personas viram *assets* embutidos no binário via o
    mecanismo nativo do Node SEA (`sea-config.json.assets`), com uma
    chave por persona (`persona-<id>.md`) mais um manifest
    (`personas-manifest.json`) listando os ids — gerado dinamicamente
    pelo script a partir do conteúdo real de `agent-server/personas/`.
  - `agents/loader.ts` ganhou dois caminhos: `loadAgentsFromSeaAssets()`
    (via `import("node:sea")` dinâmico + `sea.getAsset()`) quando
    `sea.isSea()` é verdadeiro, e `loadAgentsFromDisk()` (via
    `process.cwd()`, não mais `import.meta.url`) para o modo dev/`tsc`
    tradicional.
  - Como `loadAgents()` virou `async`, `registry.ts` ganhou um
    `initAgents()` chamado uma vez no boot do servidor, antes de
    `app.listen` — `listAgents()`/`getAgent()` continuam síncronos depois
    disso.
- **Caminhos de dados/config viraram convenção de app instalado**
  (`agent-server/src/appPaths.ts`, novo): SQLite e os relatórios HTML
  consolidados saem de `agent-server/data/` (relativo ao source, que não
  existe num binário único) para `~/Library/Application Support/DABBA/`
  no macOS (padrão equivalente em Windows/Linux). O `.env` segue a mesma
  lógica: tentado primeiro relativo ao cwd (preserva o fluxo de dev
  existente), com fallback para
  `~/Library/Application Support/DABBA/.env` — é onde a chave de API do
  usuário vai morar no app empacotado, até existir uma tela de
  configurações na GUI para isso.
- **Rust não estava no PATH desta sessão** (instalado via Homebrew/rustup
  em sessão anterior, mas o Bash tool não carrega o profile que o expõe)
  — contornado usando `/opt/homebrew/opt/rustup/bin` diretamente.
- **Lado Rust:** `lib.rs` registra `tauri-plugin-shell`, sobe o sidecar
  no `setup()` via `app.shell().sidecar("agent-server").spawn()`,
  repassa stdout/stderr do processo Node para o log do Tauri, e mata o
  processo filho em `WindowEvent::CloseRequested` (sem isso, fechar a
  janela deixaria um Node órfão escutando na porta 8765).
  `capabilities/default.json` ganhou a permissão `shell:allow-execute`
  escopada para esse sidecar específico.
- **Validado em camadas, cada uma isoladamente antes de integrar:**
  binário SEA standalone rodado direto (sem Tauri) → respondeu
  `/health` com os 5 agentes, `/agents/discovery` com a persona completa
  (2492 chars) carregada dos assets embutidos, SQLite criado no diretório
  correto, e uma chamada real de LLM (`*start` via OpenRouter) funcionou
  de ponta a ponta dentro do binário standalone antes de sequer tentar
  integrar com o Tauri.
- **`tauri build` real, dois bugs encontrados testando o `.app`/`.dmg` de
  verdade (não só compilando):**
  1. **Sidecar órfão ao sair do app.** `.on_window_event` com
     `WindowEvent::CloseRequested` só dispara ao fechar uma janela
     específica pelo X — testei "Sair" via `osascript ... quit` (equivale
     a Cmd+Q/menu Sair) e o processo `dabba` morreu mas o `agent-server`
     continuou vivo, respondendo em :8765. Corrigido trocando para
     `.build(...).run(|app, event| ...)` escutando
     `RunEvent::ExitRequested | RunEvent::Exit`, que cobre todo caminho de
     saída do app, não só o botão de fechar de uma janela. Validado de
     novo com o mesmo `osascript quit`: os dois processos morrem juntos e
     a porta é liberada.
  2. **`bundle_dmg.sh` falhando de forma intermitente.** Causa raiz:
     volumes `.dmg` órfãos de tentativas anteriores (`/Volumes/dmg.*`)
     ficando montados — o script de bundling da própria Tauri CLI monta
     uma imagem temporária para configurar o layout do Finder, e se uma
     tentativa anterior não desmontou direito (build interrompido, app
     aberto a partir do volume montado), a próxima falha ao tentar
     montar/desmontar. Não é bug de código, é estado do ambiente; mitigação
     é sempre `hdiutil detach` os volumes órfãos antes de rebuildar.
- **Testado como instalação real, não só compilação:** montei o `.dmg`
  final, copiei o `.app` de dentro dele (simulando arrastar para
  Applications) para fora do diretório de build, abri esse `.app`
  "instalado" do zero — subiu sozinho (app + sidecar), respondeu a uma
  chamada de LLM real, e ao "Sair" os dois processos morreram juntos e a
  porta 8765 ficou livre. Esse é o mesmo caminho que um usuário real
  percorreria.

## 2026-07-28 — Ícone customizado, botão do relatório e degradação das fases

Três pedidos do usuário no mesmo turno, tratados em conjunto.

### Ícone do app (símbolo próprio, mesma linguagem visual do Claude)

Fundo squircle sólido na cor terracota da marca (`#D97757` — mesmo tom do
Anthropic Orange) com um símbolo branco minimalista centralizado: um núcleo
com 4 nós conectados, representando os agentes orquestrados por um
pipeline central — não um clone do sunburst do Claude, mas a mesma
gramática visual (fundo sólido + ícone branco simples). Fonte em
`desktop-shell/src-tauri/icons/source/dabba-icon.svg`; todos os tamanhos
(macOS `.icns`, Windows `.ico`, Android, iOS, Appx) regenerados via
`tauri icon <fonte.png>`. Validado em 32×32: o símbolo continua legível
(núcleo + 4 linhas formam uma cruz reconhecível mesmo minúsculo).

### Bug real: botão "Abrir documento consolidado" não fazia nada

Causa raiz: `<a target="_blank">` dentro da webview nativa do Tauri não
abre uma janela do navegador do sistema — a GUI não tinha nenhuma
dependência `@tauri-apps/*` instalada, então mesmo com o
`tauri-plugin-shell` registrado no lado Rust (para o sidecar), não havia
como o lado JS pedir pra abrir uma URL externa. Corrigido:
- `@tauri-apps/api` + `@tauri-apps/plugin-shell` instalados na GUI
- `gui/src/openExternal.ts`: detecta `"__TAURI_INTERNALS__" in window`
  (o global real injetado pelo Tauri v2, confirmado lendo o próprio
  `core.js` do pacote) — usa `plugin-shell`'s `open()` dentro do Tauri,
  cai para `window.open` normal no browser comum (dev via `npm run dev`)
- `capabilities/default.json` ganhou `shell:allow-open` escopado por
  regex (`^https?://localhost(:\d+)?/.*$`) — só permite abrir URLs
  locais do próprio agent-server, não qualquer URL arbitrária
- Trocado o `<motion.a>` por `<motion.button onClick={() =>
  openExternal(...)}>` no `PipelineRunner.tsx`

### Bug real de robustez: uma falha de rede isolada travava o polling pra sempre

`useEffect` do polling do pipeline dava `clearInterval` no primeiro
`catch` — uma única falha transitória de rede (comum em webview nativa)
parava de checar o status permanentemente, mesmo que o pipeline
continuasse rodando no backend por mais vários minutos e terminasse com
sucesso. Corrigido: só desiste depois de 5 falhas consecutivas
(`agent-server` inteiro caído/porta fechada), não numa falha isolada.

### Bug real e mais sério: fases "conversando" em vez de executar

Ao repetir o teste completo do pipeline (5 fases encadeadas) pelo binário
SEA, o *output* de várias fases veio degradado — em vez de gerar o
artefato, o modelo respondia como se estivesse confirmando uma pergunta
da fase anterior: *"Resposta: Sim, procedemos com a validação de
rastreabilidade..."*, *"Resposta: Sim, gerarei o arquivo backlog.md..."*.
O pipeline **terminava com sucesso** (status `done`, HTML gerado) mas o
**conteúdo** de Architecture, Backlog e Business Case estava errado —
provavelmente a causa raiz do "problemas na execução completa" relatado.

Causa raiz: as personas foram escritas para um workflow humano-no-loop
(fazem perguntas de esclarecimento, terminam pedindo confirmação —
"Confirme se deseja *review* ou *trace*?"). No pipeline automatizado não
há humano pra responder; o próximo comando recebe esse texto de pergunta
como `input` e, sem instrução em contrário, o modelo trata aquilo como
uma pergunta dirigida a ele mesmo e "responde" em vez de executar sua
própria fase — degenerando em cascata pelas fases seguintes.

**Fix:** `RunRequest` ganhou um campo `autoMode?: boolean`
(`llm/provider.ts`). Quando `true`, prefixa o `systemPrompt` com uma
instrução explícita: modo pipeline automatizado, nunca perguntar/pedir
confirmação, gerar o artefato completo direto adotando suposições
razoáveis e documentadas. `orchestrator.ts` passa `autoMode: true` em
toda chamada do pipeline (não afeta a execução individual via
`CommandPanel`, onde um humano real está de fato interagindo e pode
querer as perguntas de elicitação).

**Validado repetindo o mesmo teste**, comparando antes/depois: sem
`autoMode`, Architecture saía como "Confirmação de próximo passo..." em
vez do TOGAF ADM; com `autoMode`, saiu `# architecture.md` com as fases A-E
de verdade. Backlog saiu com Epics reais em vez de "Resposta: Sim,
gerarei o arquivo...". Mesmo padrão corrigido nas 5 fases.

## 2026-07-28 — Instalação real do usuário: dois bugs sérios reportados

Usuário testou a instalação do zero e reportou dois problemas reais,
investigados e corrigidos.

### Corrida de inicialização: "Falha ao conectar ao agent-server: Load failed"

O app abriu normalmente, mas a GUI mostrou esse erro no final. Causa:
`App.tsx` fazia **uma única tentativa** de `fetchAgents()` no mount, sem
retry. No app empacotado, a janela do Tauri renderiza antes do sidecar
(binário Node de ~145MB) terminar de subir — especialmente na primeira
execução, quando o Gatekeeper ainda está verificando a assinatura. Se o
primeiro fetch chega antes da porta 8765 estar de pé, o erro fica
permanente mesmo com o backend saudável segundos depois.

**Fix:** `useEffect` em `App.tsx` agora tenta até 20 vezes, a cada 1s
(20s de margem), só mostrando o erro definitivo se todas as tentativas
falharem. Cobre tanto a corrida de boot quanto qualquer hiccup transitório
de rede depois.

### Bug mais sério: processo `agent-server` travado a ~98-100% de CPU indefinidamente

Usuário reportou um processo do DABBA consumindo CPU sem parar. **Reproduzi
de verdade**: rodando o app diretamente de dentro do volume `.dmg` montado
(sem instalar em Applications primeiro — cenário muito comum, já que o
usuário só tinha "duplo-clicado" sem arrastar pro Applications antes),
encontrei um processo `agent-server` de um teste anterior meu preso a
94-100% de CPU **por mais de 25 minutos seguidos**, com conexões TCP
abertas mas nunca respondendo.

**Investigação:** tentei `sample`/`spindump` para capturar um stack trace
do processo travado, mas ambos exigem root interativo, indisponível neste
ambiente. Via `lsof -p <pid>` encontrei duas pistas: (1) o `cwd` do
processo travado apontava para `/` (raiz do filesystem) em vez de um
diretório esperado, e (2) o processo tinha arquivos gráficos Metal
(`.metallib`) abertos — bizarro para um processo Express/SQLite headless.
Isso, somado ao padrão de "múltiplas tentativas de abrir o app" relatado
pelo usuário (que reportou "duplo-clique não funcionou" mais de uma vez),
apontou para a hipótese mais provável: **múltiplas instâncias do sidecar
rodando ao mesmo tempo**, disputando o mesmo arquivo SQLite
(`~/Library/Application Support/DABBA/data/dabba.sqlite`, compartilhado
entre todas as instâncias independente de onde cada uma rode) — uma
delas presa endeça em retry de lock de arquivo.

**Fix — duas camadas de defesa, ambas em `lib.rs`:**
1. `tauri-plugin-single-instance`: registrado como o primeiro plugin (é
   requisito da própria lib). Uma segunda tentativa de abrir o app agora
   só foca a janela já existente, nunca spawna um segundo sidecar.
2. `current_dir()` explícito no builder do sidecar (usando o home do
   usuário via crate `dirs`), em vez de herdar o cwd do processo pai —
   que pode ser imprevisível (`/`) dependendo de como o app foi aberto.

**Validado:** abri o app 3 vezes em sequência rápida — só uma instância
de `dabba` e uma de `agent-server` subiram (confirmando o single-instance
funcionando). Rodei um pipeline completo de 5 fases monitorando CPU a
cada 20s durante toda a execução: nunca passou de 0.4%, terminou com
sucesso, CPU final 1.3%. Fechei via `osascript quit` de novo — ambos os
processos morreram juntos, porta liberada. Nenhuma reincidência do
travamento nesses testes controlados.

**Limitação da investigação:** não consegui confirmar a causa raiz exata
via stack trace (sem acesso a root para profiling neste ambiente) — a
correção é uma mitigação de defesa em profundidade baseada nas evidências
disponíveis (múltiplas instâncias + cwd suspeito), não uma correção
cirúrgica confirmada linha a linha. Se o usuário reportar o mesmo travamento
de novo mesmo com o app instalado corretamente em Applications e só uma
instância aberta, será preciso investigar mais a fundo com acesso a root.

---

## Pipeline em dry-run mesmo com a chave configurada (regressão do fix de cwd)

**Sintoma:** o usuário reportou que o pipeline não rodava, atribuindo à chave
da OpenRouter. A chave estava correta e válida (confirmado batendo em
`/api/v1/key`, HTTP 200, e rodando completions em 4 dos 5 modelos free da
lista), e o arquivo `~/Library/Application Support/DABBA/.env` existia com
ela. Ainda assim o app empacotado respondia `mode: "dry-run"` — "Nenhum
provider LLM configurado".

**Causa raiz — autoinfligida pelo fix anterior.** O `current_dir()` que
adicionei em `lib.rs` (mitigação do travamento de CPU) passou a rodar o
sidecar com cwd no home do usuário. O `index.ts` carrega, nesta ordem:

```ts
if (existsSync(".env")) dotenv.config({ path: ".env" }); // relativo ao cwd
dotenv.config({ path: ENV_FILE });                        // config do usuário
```

O home do usuário tem um `~/.env` (do AIOS) contendo `OPENROUTER_API_KEY=`
**vazio**. Como `dotenv` nunca sobrescreve variável já definida, a chave era
fixada como string vazia na primeira chamada e o `.env` real do DABBA virava
no-op. String vazia é falsy no `provider.ts` → dry-run silencioso.

**Fix:** o `.env` relativo ao cwd só é lido fora do binário empacotado
(`!isSea()`, de `node:sea`). Empacotado, apenas o arquivo de config do
usuário vale — o cwd é de quem abriu o app e não é uma fonte confiável.

**Validado:** rodei o sidecar recém-buildado com `cwd=$HOME` (a condição
exata que quebrava, com o `~/.env` de chave vazia presente) → `mode: "live"`.
Confirmei que o dev não regrediu (`tsx src/index.ts` no diretório do
agent-server → `mode: "live"`). Instalei o build em `/Applications` e rodei
um pipeline completo pela API do app: 5/5 fases com conteúdo real via
OpenRouter, CPU do sidecar entre 0.6% e 3.2% durante toda a execução.

**Lição:** mudar o cwd de um processo é uma mudança de ambiente, não só de
caminho — qualquer leitura relativa (aqui, `dotenv`) muda de significado
junto. A ordem "carrega genérico primeiro, específico depois" só é segura
quando a fonte genérica é confiável.

---

## Reestilização da GUI para a linguagem visual do comp DABBA Studio

**O que mudou:** só a camada visual — nenhuma mudança de estrutura, fluxo ou
componente. A paleta foi amostrada pixel a pixel do comp de referência em
vez de estimada: papel `#F2EFE8`, painel `#E5E1D8`, tinta `#11110F`,
acento terracota `#ED6738`, texto de apoio `#5C5952`, régua `#D3CFC5`.

**Decisões de sistema:**
- **Serifa → grotesca.** `Fraunces` saiu; o display agora é Helvetica Neue
  (nativo no macOS, fidelidade exata ao comp e sem dependência de rede),
  com `Inter Tight` do Google Fonts como fallback multiplataforma.
- **Superfícies planas.** Todas as sombras viraram `none` e os raios caíram
  para 2–3px. A hierarquia passa a vir de régua, contraste de fundo e
  tipografia — que é como o comp separa as camadas.
- **Segunda voz tipográfica.** Classe `.dabba-eyebrow` (mono, caixa alta,
  `letter-spacing: .16em`) para rótulos, numeração de fase e status.
- **Gradientes fora.** Botão primário virou retângulo preto sólido; barra de
  progresso, chip de status e botão de relatório usam o acento chapado.

**Dois bugs reais encontrados e corrigidos durante a validação:**

1. **Botão desabilitado invisível.** No tema editorial o fundo `muted` do
   estado desabilitado é exatamente o fundo do painel que hospeda o botão —
   sem borda, o controle sumia da tela. Passou a ter contorno próprio.

2. **Linha da fase em execução quase invisível (`opacity: 0.058`).** A
   `PhaseTimeline` era o único componente que ainda usava
   `initial={{ opacity: 0 }}`. Quando o `requestAnimationFrame` é suspenso
   (janela minimizada ou em segundo plano) a animação congela onde estiver —
   e congelou perto de zero, escondendo justamente a fase ativa. `AgentGrid`
   e `PipelineRunner` já documentavam esse risco e evitavam gate de
   opacidade na entrada; a timeline ficou de fora. Agora entra só por
   transform, e o dimming de "pendente" parte de 1, nunca de 0.

**Validação:** typecheck e build de produção passando; página inspecionada
nos temas claro e escuro com um pipeline real em execução (as 5 fases
visíveis, numeradas, com a fase corrente em acento). Vale registrar que o
painel de preview do navegador roda com `document.hidden = true`, o que
congela transições CSS e animações do framer-motion em `currentTime: 0` —
dois "bugs" investigados eram artefato disso, confirmado antes de descartar.

---

## Anel de progresso nas fases, rótulo em gerúndio, EN-US e ordem de pipeline

Quatro mudanças de interface pedidas em conjunto.

**1. Anel preenchendo o ícone da fase (`PhaseNode.tsx`).** Cada nó da timeline
virou um SVG com dois círculos concêntricos: trilho neutro e anel de progresso
com `stroke-dasharray`/`stroke-dashoffset`. O disco interno também tinge
devagar (terracota rodando, verde concluído).

A duração real de uma fase depende do modelo e do tamanho da RFP — não existe
progresso verdadeiro para mostrar. Em vez de fingir precisão, o anel avança até
**92%** com easing desacelerado e só fecha o círculo quando o artefato chega de
fato. Comunica "em andamento" sem prometer um tempo que não sabemos.

**2. Rótulo de execução em gerúndio (`RunningLabel.tsx`).** Uma palavra por vez,
no espírito do spinner do Claude Code, agrupadas por fase (Excavating/
Prospecting no Discovery, Drafting/Distilling no PRD, Blueprinting no
Architecture…). Como o pipeline já sabe onde está, a palavra acompanha o
trabalho real em vez de sortear.

A primeira versão usava `AnimatePresence mode="wait"`, e **travava**: a palavra
nova só monta quando a saída da anterior termina, e essa animação depende de
rAF — suspenso com a janela em segundo plano. Trocado por remontagem via `key`
sem gate de opacidade, o mesmo padrão que o resto da UI já adota.

**3. Projeto em EN-US.** Todas as strings de interface e todos os comentários
de `gui/src` traduzidos (verificado com grep por diacríticos: zero ocorrências).
O `agent-server` — comentários e, principalmente, as personas dos agentes —
segue em português e é a próxima etapa; as personas são conteúdo que dirige a
saída do LLM, então traduzi-las muda o produto, não só o código.

**4. Ordem de pipeline em vez de alfabética (`phases.ts`).** O agent-server
devolve os agentes em ordem alfabética (architect, backlog, business-case,
discovery, prd), que não tem relação com a ordem em que o trabalho acontece —
e a numeração dos cards ficava mentindo. A ordem canônica agora vive em um
único módulo, consumido pela timeline e pelo grid.

**Validação (na janela real do app, não no preview):** o painel de preview roda
com `document.hidden = true`, que suspende rAF e congela tanto o anel quanto a
rotação das palavras — por isso a verificação foi feita no app empacotado.
Observado ao vivo: Discovery com anel laranja parcial e rótulo "Sleuthing…",
depois Discovery com anel verde fechado + check e PRD com anel laranja parcial
e rótulo "Drafting…" — confirmando o preenchimento, o fechamento na conclusão e
a troca de pool de palavras junto com a fase.

---

## Tempo por fase, personas Marvel e artefato 100% EN-US

**Tempo de execução por fase.** Os artefatos já carregam `created_at` e o run
também — a duração de uma fase é a diferença para o artefato anterior (ou para
o início do run, na primeira). Nada de schema novo. A fase em execução mostra
contagem ao vivo, calculada no render e avançada pelo tick de 1s que o
`PipelineRunner` já mantinha. Um detalhe: o valor ao vivo usa `Date.now()` do
cliente e pode passar alguns segundos do real até o polling (3s) entregar o
timestamp do servidor — quando chega, o número assenta no valor autoritativo.
O rótulo usa mono **sem** a classe `.dabba-eyebrow`, cujo `text-transform`
renderizava "30s" como "30S".

**Personas Marvel.** Escolhidas pelo papel, não por popularidade:
Natasha (discovery — reconhecimento e elicitação), Vision (PRD — síntese e
rastreabilidade), Tony (architect — engenharia), Steve (backlog — decompor uma
missão em passos), Pepper (business-case — CEO, ROI, GO/NO-GO).

**Artefato 100% EN-US — a causa era o prompt, não o template.** O relatório
saía misturado porque *as personas estavam escritas em português*: o idioma da
saída de um LLM segue o idioma do system prompt. Traduzir só o HTML teria
deixado o conteúdo — a maior parte do documento — em português.

Foram três frentes:
1. As 5 personas traduzidas (812 linhas), preservando caminhos de ícones e
   templates Mermaid intactos.
2. `loader.ts` passou a fazer parse de `## Commands` — o parser procurava
   `## Comandos` e traduzir as personas sem isso zeraria a lista de comandos
   de todo agente.
3. Uma `LANGUAGE_RULE` no topo de **todo** system prompt (não só do pipeline:
   um comando avulso também gera artefato para cliente). Sem ela o modelo
   espelha o idioma da entrada — uma RFP em português voltaria a produzir
   documento em português mesmo com persona inglesa.

Também traduzidos: o gerador de HTML (`lang="en"`, data em `en-US`, títulos) e
as mensagens de erro da API, que são voltadas ao usuário.

**Validação:** rodei o pipeline completo com uma **RFP escrita em português**
(rede de clínicas, LGPD, prazo em meses). As 5 fases saíram em inglês e o
relatório final tem **zero diacríticos portugueses** no documento inteiro —
o teste que só passa se o prompt, e não apenas o template, estiver correto.

**Efeito colateral achado no caminho:** o loop que eu usava para contornar o
`bundle_dmg.sh` matava o processo `dabba` auto-relançado do volume montado,
mas não o `agent-server` que ele havia gerado — sobraram dois sidecars órfãos
segurando a porta 8765. O `kill_sidecar` do Rust só roda em saída graciosa.

---

## Personas expandidas para manuais operacionais completos

As 5 personas (`agent-server/personas/*.md`) passaram de prompts de referência
rápida (79-165 linhas) para manuais operacionais completos (341-629 linhas),
mantendo **intocados**: Authority, Commands, Workflow, e toda estrutura de
template/documento (PRD Structure, Backlog Structure, Business Case Structure,
TOGAF ADM phases, ADR Format, ícones Azure/M365, Mermaid templates). Verificado
programaticamente: as 5 listas de comandos retornadas por `GET /agents` são
byte-idênticas às de antes da expansão (mesma contagem, mesma ordem, mesmo
texto).

Cada persona ganhou: Mission, Philosophy, Mental Model, Decision Framework,
Principles, Detailed Workflow (elabora o Workflow original sem alterar seus
passos), Techniques, Methodologies, Heuristics, Red Flags, Anti-Patterns,
Quality Criteria, Internal Checklist, Best Practices, Examples e Delegation
Criteria.

Fundamentação usada por agente (não inventada — metodologias reais e
reconhecidas na área):
- **Natasha (discovery):** BABOK, Design Thinking (Empathise/Define),
  Jobs-to-be-Done, Cynefin.
- **Vision (prd):** BABOK, ISO/IEC 25010, RFC 2119 (MUST/SHOULD/MAY),
  linhagem IEEE 830 de engenharia de requisitos.
- **Tony (architect):** TOGAF 10 ADM (já era a base), C4 Model, Domain-Driven
  Design, Twelve-Factor App, ISO/IEC 25010.
- **Steve (backlog):** Scrum, INVEST (Bill Wake), estimativa relativa
  (planning poker), capacity planning no estilo SAFe, WSJF.
- **Pepper (business-case):** capital budgeting padrão (NPV/IRR/payback),
  McKinsey Pyramid Principle, matrizes de risco probabilidade×impacto,
  frameworks Build vs Buy vs Integrate.

**Validação:** `GET /agents` confirma as 5 listas de comandos inalteradas;
typecheck limpo (só os 2 erros pré-existentes já documentados, não
relacionados); teste de execução real do comando `*start` do @discovery
confirmando que a persona expandida ainda produz saída coerente e no formato
esperado.

**Nomenclatura conceitual (não uma reestruturação de pastas):** o usuário
propôs renomear a organização conceitual do framework (DABBA Studio Core /
Expert Personas / Methodology / Templates / Knowledge Base). Optei por **não**
renomear fisicamente as pastas (`personas/`, `templates/`) porque
`loader.ts`, `scripts/build-sidecar.mjs` (assets SEA `persona-${id}.md`,
`personas-manifest.json`) e o README dependem desses nomes — renomear exigiria
tocar build tooling e reduziria a rastreabilidade das mudanças. A nomenclatura
conceitual está registrada aqui como referência; uma reestruturação física
real, se desejada, deve ser um passo separado e deliberado.

---

## Bug real no desembrulho de fence — Architecture e Backlog viravam bloco de código único

**Sintoma reportado:** o `report.html` "desconfigurado" nas fases Architecture e
Backlog — texto corrido sem formatação, diagramas Mermaid como texto solto,
tabelas quebradas.

**Causa raiz confirmada com dados reais** (extraídos direto do SQLite do run
que o usuário reportou): o modelo envolve a resposta inteira num
`\`\`\`markdown ... \`\`\`` externo, mas Architecture e Backlog também têm
diagramas Mermaid legítimos dentro (`\`\`\`mermaid`), então o documento tem
**múltiplos pares de fence**, não um só. O `unwrapOuterCodeFence` antigo só
desembrulhava quando havia **exatamente 1 par** de fences no documento inteiro
— com mais pares (6 para Architecture, 3 para Backlog neste run), ele desistia
e o parser tratava o `\`\`\`markdown` externo como código literal, virando
`<pre><code>` do início ao fim: cabeçalhos, negrito, listas e os próprios
diagramas Mermaid, tudo como texto pré-formatado sem estrutura nenhuma.

Discovery (@discovery) e PRD/Business-case não tinham esse wrapper externo
neste run, por isso pareciam normais — mascarando que o bug só aparecia
quando a fase tinha diagramas Mermaid *e* vinha embrulhada.

**Correção:** `unwrapOuterCodeFence` (`agent-server/src/pipeline/markdown.ts`)
passou a detectar o wrapper **pela posição**, não pela contagem: se a primeira
linha não-vazia do documento abre um fence e a última fecha um, esse par é o
wrapper externo — remove só essas duas linhas de borda e preserva tudo entre
elas intacto, incluindo qualquer fence aninhado. Nenhuma das personas começa
um documento com um fence como primeira linha genuína, então esse sinal é
seguro sem precisar inspecionar o conteúdo do meio.

**Validação:** reconstruí o HTML das 5 fases do run real reportado
(`b9745a98-...`) com o parser corrigido. Architecture foi de 0 headings (tudo
em um `<pre>` só) para 9 headings reais + 5 blocos `<pre>` de Mermaid
corretamente isolados; Backlog foi de "documento inteiro em bloco de código"
para headings reais e 3 blocos de código isolados, zero crase solta escapando
para o texto. Regenerei o `report.html` desse run específico e conferi
visualmente no navegador: títulos em negrito, listas com marcadores, Mermaid
em blocos de código legíveis.

**O que não foi corrigido, e por quê — problema real, mas de conteúdo do
modelo, não de template:**
- **Discovery** retornou apenas `"@discovery *generate"` (23 caracteres) —
  o modelo (`nvidia/nemotron-nano-9b-v2:free`) essencialmente não executou o
  comando `*start`, só ecoou uma referência de comando. Nenhum ajuste de
  parser resolve isso; é o modelo gratuito falhando em seguir a persona.
- **Business Case** repetiu o bloco "Executive Summary" duas vezes e o
  Backlog repetiu a tabela "Staffing Plan" duas vezes — o modelo reintroduziu
  conteúdo já dado numa etapa anterior do encadeamento de comandos, apesar da
  persona instruir explicitamente "produces **only** that section". Confirma
  a suspeita do usuário: com modelos free pequenos, esse tipo de repetição é
  uma limitação real do modelo, não um bug de código — registrado aqui, não
  corrigido, porque não há ajuste de parser que resolva um modelo repetindo
  conteúdo por conta própria.

---

## Correção real do pareamento de fences (não só o wrapper externo)

A correção anterior ("Bug real no desembrulho de fence") resolveu Architecture
mas **piorou Backlog** — reportado pelo usuário ("temos muitos erros na
section backlog agora") logo após o primeiro fix. Investigação mostrou que a
correção anterior era só parcialmente certa: ela detectava um wrapper externo
pela posição (primeira/última linha), mas o Backlog concatena 3 respostas
separadas do modelo (`*breakdown → *estimate → *staffing`), e só a primeira
tinha exatamente esse formato — as outras ficavam soltas no meio do
documento, fora do alcance da heurística posicional.

**Causa raiz mais profunda, comum aos dois bugs:** o loop principal do parser
(`markdownToHtml`) tratava **qualquer** linha começando com `\`\`\`` como uma
alternância abre/fecha, sem checar a regra real do CommonMark: um fechamento
válido não pode ter "info string" (texto depois dos backticks). Uma linha
como `\`\`\`mermaid` encontrada enquanto já se está dentro de um bloco **não
fecha nada** — ela é conteúdo literal do bloco aberto. Sem essa regra, o
parser pareava fences errados entre si sempre que havia mais de um par no
documento (ex.: um wrapper `\`\`\`markdown` externo com um `\`\`\`mermaid`
genuíno dentro), embaralhando quais trechos viravam código vs. texto normal.

**Correção definitiva, em duas partes:**
1. `unwrapOuterCodeFence` reescrita para parear fences corretamente (respeitando
   a regra do CommonMark) e remover **todo** bloco cuja linguagem seja vazia,
   `markdown` ou `md` — onde quer que apareça no documento, não só nas bordas.
   Roda em passadas repetidas (até 5), porque desembrulhar um wrapper pode
   revelar outro que estava enterrado dentro dele.
2. O loop principal de `markdownToHtml` também passou a respeitar a mesma
   regra (fechamento só é válido sem info string), como defesa em profundidade
   — importante porque as personas continuam emitindo fences reais
   (`\`\`\`mermaid`) que precisam ser pareados corretamente mesmo depois do
   desembrulho.

**Validação com os dados reais do run reportado:** Backlog foi de 4 para 26
headings reais (antes: só a cauda do documento — Effort Estimation/Staffing
Plan — renderizava; agora todos os Epics/Stories renderizam com listas e
negrito). Architecture manteve-se correto.

**Limite genuíno encontrado durante a validação, não corrigido:** nesse
mesmo run, o modelo **esqueceu de fechar** o primeiro diagrama Mermaid
("Context Diagram") — abre `\`\`\`mermaid` e nunca fecha. Por semântica real
de fence, isso funde esse diagrama com o próximo até encontrar o primeiro
fechamento válido (o fechamento do segundo diagrama). O parser está correto
ao tratar isso assim — não existe heurística segura para "adivinhar" onde um
fence deveria ter fechado sem arriscar corromper blocos de código genuínos em
outros documentos. Efeito prático: uma seção pontual funde duas linhas de
prosa dentro da caixa de código do diagrama, tudo ainda legível, sem quebrar
o resto do relatório. Mais um caso de limitação do modelo gratuito, como o
usuário já suspeitava.

---

## Pipeline enriquecido: fases mais completas (comparação com os agentes do framework)

**Contexto:** análise profunda comparando as personas do DABBA
(`agent-server/personas/*.md`) e o `orchestrator.ts` contra os agentes de
referência do framework original (`DPABB-Framework/agents/*.md`), rodando 3
execuções reais salvas no SQLite para medir o comportamento de fato (não só
ler as personas). Achados:

1. **Discovery rodava o comando errado.** `PIPELINE_STEPS` chamava `*start`
   ("Begin a guided discovery interview") num pipeline 100% automático, sem
   humano para responder — o artefato real virava um roteiro de perguntas
   ("What specific gaps..."), com **zero requisitos capturados**, violando o
   próprio checklist da persona ("at least 5 high-level requirements"). Todas
   as fases seguintes herdavam essa premissa vazia.
2. **Rastreabilidade (princípio nº1 do framework) não se sustentava em
   nenhum dos 3 runs medidos.** Dois runs: o PRD definia FRs e o backlog
   nunca os citava (0% de cobertura). Um run: o backlog citava 12 FR-IDs,
   dos quais **9 eram inventados** (FR-004 a FR-012, nunca definidos no
   PRD). Os comandos `*trace` (prd e backlog) existem exatamente para pegar
   isso e nunca eram chamados.
3. **Architecture entregava 4-8 dos 11 diagramas Mermaid exigidos pelo
   `CLAUDE.md`**, chamando `*design` sozinho — o mesmo padrão de "mega-prompt
   derruba seções" já visto e corrigido no Backlog (`*estimate`/`*staffing`).
   ADRs oscilavam de 0 a 5 sem critério.
4. ~60% do vocabulário de comandos das personas nunca era invocado pelo
   orchestrator.

**Correção — `agent-server/src/pipeline/orchestrator.ts`:** `PIPELINE_STEPS`
reescrito fase a fase, aplicando a MESMA regra que já funcionava para
Backlog — **só encadear um comando extra se seu escopo for genuinamente
disjunto** do que um comando anterior na mesma fase já produz (evita
duplicar conteúdo, o mesmo tipo de dano visto na fusão indevida de fences):

| Fase | Antes | Depois | Por quê |
|------|-------|--------|---------|
| Discovery | `*start` | `*generate` | `*start` é modo-entrevista, não gera relatório sem humano; `*generate` já cobre os 6 passos do workflow (contexto → stakeholders → problemas → restrições → premissas/riscos → relatório) |
| PRD | `*generate` | `*generate → *trace` | `*trace` é checagem, não geração — disjunto. `*personas` foi propositalmente deixado de fora: já é seção 3 do `*generate` |
| Architecture | `*design` | `*phase-a → *phase-b → *phase-c → *phase-d → *phase-e → *review` | Split não-sobreposto por fase TOGAF, mesma lógica que corrigiu o Backlog. `*phase-e` **não existia como comando** — adicionado à persona (cobre Opportunities & Solutions + Team Plan E.4-E.9, que já estavam descritos no corpo do documento sem comando dedicado) |
| Backlog | `*breakdown → *estimate → *staffing` | `+ *sprint → *trace` | `*prioritize`/`*dependencies` ficaram de fora: `*breakdown` já inclui campo Prioridade e Dependências por story — chamá-los de novo restataria, não acrescentaria |
| Business Case | `*analyze` | *(sem mudança)* | único caso em que o comando único já entregava a estrutura completa (10/10 seções) nos 3 runs medidos; os demais comandos (`*roi`, `*costs`, `*risks`, `*alternatives`, `*recommendation`) cobrem seções que `*analyze` já produz — encadeá-los arriscaria duplicar, não somar |

**Validação end-to-end (run real, RFP de varejo, `nvidia/nemotron-nano-9b-v2:free`
via OpenRouter):**

| Métrica | Antes (3 runs) | Depois (1 run) |
|---|---|---|
| Discovery — requisitos capturados | 0 | relatório completo com 7 seções, tabela de stakeholders |
| Diagramas Mermaid (meta: 11) | 4, 8, 5 | **13** |
| ADRs | 1, 0, 5 | **6** |
| FRs órfãos no backlog (inventados) | até 9 | **0** |
| Duração total do pipeline | ~7min (7 chamadas de LLM) | **14,3min** (16 chamadas de LLM) |

**Trade-off aceito e comunicado ao usuário antes de implementar:** o pipeline
foi de 7 para 16 chamadas de LLM, dobrando o tempo de execução. Vale para
entregável de cliente (o objetivo do enriquecimento); é exagero para um teste
rápido — ainda não há um modo "rápido vs. completo" configurável, fica como
possível próximo passo.

**Não-regressão confirmada:** o parser de fences (`markdown.ts`, corrigido na
seção anterior) não foi tocado nesta mudança. O novo run ainda mostra ~12
backticks soltos na renderização (Architecture e Backlog) — mas são o MESMO
tipo de defeito genuíno de modelo já documentado acima (linhas malformadas
tipo `` ```<next_steps> `` e `` `````` ``, não CommonMark válido), não uma
regressão introduzida por este encadeamento. Confirmado inspecionando as
linhas de fence brutas do artefato.

---

## Tabelas desconfiguradas em Architecture/Backlog/Business Case — os "backticks
## soltos" da seção anterior eram maiores do que o estimado

**Contexto:** o usuário reportou tabelas quebradas no relatório consolidado
nas 3 fases finais. Investigação com dados reais (mesmo run de teste do
enriquecimento de pipeline) achou que os "~12 backticks soltos, efeito
cosmético pontual" documentados na seção anterior na verdade eram o SINTOMA
de dois bugs de fence bem mais sérios — não um único caso isolado.

**Bug 1 — fences com tag falsa em ângulos engolindo o documento inteiro.**
O modelo às vezes fecha uma seção com uma tag hallucinada tipo
`` ```<next_steps> `` ou `` ```<status> ``. Tratada como fence real (info
não-vazio), ela abre um bloco de código que só fecha no próximo `` ``` ``
solto encontrado — e como fences reais não aninham, se houver um
`` ```mermaid ``...`` ``` `` legítimo no meio do caminho, o fechamento DELE é
consumido como se fosse o fechamento da tag falsa, deixando o mermaid órfão e
arrastando tudo entre eles (títulos, tabelas reais) para dentro de um único
`<pre>`. Medido em produção: **3041 caracteres** de conteúdo real
(Architecture, Phase D inteira) engolidos de uma vez.

**Bug 2 — tabelas markdown genuínas rotuladas como `` ```table `` ou
dentro de um `` ```mermaid `` mal-empregado.** O modelo escreve uma tabela
real (`| Component | Decision | ... |`) mas embrulha em `` ```table `` (não é
markdown/md/vazio, então a heurística antiga não desembrulhava) ou pior,
dentro de `` ```mermaid `` seguido da palavra `table` — "table" não é um tipo
de diagrama Mermaid válido, é o modelo confundindo os dois formatos. Como
qualquer fence com info não-vazio virava bloco de código, o pipe-syntax da
tabela era escapado e mostrado como texto monoespaçado cru em vez de virar
`<table>`.

**Bug 3 — mermaid genuíno sem fechamento, arrastando tabelas reais adiante.**
Caso adicional, mais grave que o "merge de 2 linhas" documentado antes: um
`` ```mermaid `` de dependency graph no Backlog nunca fechava (o modelo
seguia direto para `**Notes:**` em prosa sem `` ``` ``). Sem um fechamento
real próximo, o parser (corretamente, por semântica de fence) engolia tudo
até o próximo `` ``` `` acidental — que no caso media **6819 caracteres** e
incluía as tabelas de Effort Estimation, Staffing Plan e Sprint 1 inteiras.

**Correções, todas em `agent-server/src/pipeline/markdown.ts`:**

1. **`unwrapOuterCodeFence` virou allowlist, não blocklist.** Antes: só
   desembrulhava fence com info vazio/`markdown`/`md`. Agora: `mermaid` é a
   ÚNICA linguagem de fence que essas personas emitem de propósito (o
   relatório não tem mermaid.js — um `` ```mermaid `` já é deliberadamente
   mostrado como texto-fonte, não renderizado) — então qualquer fence cujo
   info não seja exatamente `mermaid` é tratado como wrapper falso e
   desembrulhado, reexpondo o conteúdo para ser reparseado como markdown
   normal (tabelas viram `<table>`, prosa vira `<p>`). Resolve o Bug 2 para
   o caso `` ```table ``.
2. **`stripFakeTagFences` — nova função, roda antes de qualquer pareamento.**
   Remove linhas que batem com `` ```<algo>  `` (tag entre ângulos) inteiras,
   ANTES do algoritmo de pareamento de fences rodar — evita que elas sejam
   tratadas como abertura/fechamento real e evita a colisão de pareamento com
   fences legítimos aninhados. Resolve o Bug 1.
3. **Detecção de `` ```mermaid `` mal-empregado como tabela.** Se a primeira
   linha de conteúdo de um bloco `` ```mermaid `` for literalmente a palavra
   `table`, trata como wrapper falso também (mesmo mecanismo do item 1) e
   remove essa linha-marcador, não só as bordas do fence. Resolve o resto do
   Bug 2.
4. **Fechamento implícito por `---` no loop principal de render.** No
   parser final (`markdownToHtml`), se uma linha `---` isolada (só traços,
   nada mais) aparece enquanto um bloco de código está aberto, o parser fecha
   o bloco ali mesmo antes de processar a linha como divisor normal — seguro
   porque `---` isolado é convenção de separador de seção usada em toda a
   documentação dessas personas e nunca é sintaxe Mermaid válida sozinha
   (uma aresta real sempre tem nomes de nó nos dois lados, ex. `A --- B`).
   Resolve o Bug 3.

**Validação end-to-end** (mesmo run de teste, antes vs. depois desta
correção, medido tanto via `markdownToHtml` isolado quanto no
`report.html` renderizado de verdade no navegador):

| Fase | Tabelas antes | Tabelas depois | Blocos `<pre>` quebrados antes | Depois |
|---|---|---|---|---|
| Architecture | 10-11 | **14** | 3 | **0** |
| Backlog | 2 | **5** | 1 (6819 caracteres) | **0** |
| Business Case | 5 | 5 | 0 | 0 |

Business Case não tinha blocos quebrados neste run específico, mas contém o
mesmo padrão de tags falsas (`` ```<confirmation> ``) — coberto pela mesma
correção geral (Bug 1), não por um fix específico da fase.

**Risco aceito, explicitamente avaliado:** a regra do `---` implícito (item 4)
é a única heurística "adivinhando" uma intenção do modelo em vez de seguir
CommonMark à risca — decidido como seguro porque `---` sozinho não tem
nenhum uso legítimo dentro de um bloco de código Mermaid nestas documentos, e
o padrão de usar `---` como separador de seção é 100% consistente em todas
as 5 personas. Diferente da correção anterior (fusão de 2 linhas em 1
diagrama), aqui a heurística é justificada porque o "unclosed fence" real
estava causando dano medido e recorrente (não um caso isolado), não porque
a barra de segurança foi rebaixada.

---

## Emojis e erros de conteúdo no relatório final

**Contexto:** usuário reportou emojis e "erros" no `report.html`. A auditoria do
run reportado (`9419b1c9`) achou 5 defeitos distintos, de gravidade bem
diferente entre si.

### 1. Emojis (pedido explícito)

9 emojis (✅ ⚠️ 📌) espalhados por PRD, Architecture e Backlog, sobretudo em
seções de checklist/validação. Corrigido em **duas camadas**, mesmo padrão já
adotado no projeto (prompt previne, código garante):

- **Prevenção:** novo `FORMATTING_RULE` global em `llm/provider.ts`, aplicado a
  toda chamada junto do `LANGUAGE_RULE`. Ficou no provider e não nas 5 personas
  porque o defeito aparecia em todas as fases — uma fonte só, não cinco cópias.
- **Garantia:** `stripEmoji` em `markdown.ts` usando a propriedade Unicode
  `\p{Extended_Pictographic}`, que é exatamente "emoji pictográfico" — remove
  ✅⚠️📌❌🚀 e **não** toca em →, ✓, •, — nem símbolos de moeda, todos com uso
  legítimo nesses documentos (verificado caso a caso antes de escolher).

**Regressão pega na validação:** a primeira versão colapsava espaços
duplicados globalmente para limpar o espaço órfão do emoji — o que achatou a
indentação dentro dos blocos Mermaid (`    Start` virou ` Start`). Corrigido
para consumir só o espaço adjacente ao emoji (`EMOJI+[ \t]*`), deixando a
indentação do resto do documento intacta.

### 2. Duplicação com números contraditórios (o defeito mais grave)

O Backlog trazia **duas** seções "Effort Estimation" (84 pts e 107 pts) e
**três** "Staffing Plans". Para o leitor não há como saber qual vale — pior que
uma seção faltando.

**Causa raiz 1 — contradição dentro da própria persona.** `backlog.md` dizia na
linha 138 que Effort/Staffing são produzidos por `*estimate`/`*staffing` e
**não** por `*breakdown`, e na linha 395 o oposto ("são obrigatórios em toda
execução de `*breakdown`"). O modelo obedecia as duas.

**Causa raiz 2 — o template "Backlog Structure".** Mostrava o documento
consolidado inteiro num único bloco, com `## Effort Estimation` e
`## Staffing Plan` visíveis. Mesmo anotado com `[… output of *estimate …]`, o
modelo reproduzia o template todo no `*breakdown`. Reescrito em blocos
separados, cada um rotulado com o comando que o possui.

**Ainda insuficiente — a garantia determinística.** Testado com o comando
isolado após as duas correções de prompt: o nemotron-nano-9b **continuou**
emitindo as seções. Um modelo gratuito de 9B não obedece instrução de escopo de
forma confiável, então a correção real é `dedupeRepeatedSections` no
`orchestrator.ts`: ao concatenar os comandos de uma fase, títulos H2 repetidos
são reduzidos à **última** ocorrência — a do comando que de fato possui a seção
(a estimativa do `*estimate` é mais elaborada que a que o `*breakdown` anexou).
Só H2 é comparado; H3 ("Key Considerations") repete legitimamente sob pais
diferentes.

### 3. Fences fantasma na emenda entre comandos

Ao implementar a dedup ela não removia nada, e o motivo revelou um bug maior:
`unwrapOuterCodeFence` rodava **por seção**, então um fence deixado em aberto
pelo modelo numa seção pareava com outro solto da seção seguinte **depois** da
concatenação, formando um bloco de código fantasma cruzando a emenda (medido:
linhas 260–341 do artefato, escondendo os títulos duplicados de qualquer
análise estrutural). Corrigido desembrulhando **também** o texto já combinado,
antes da dedup.

### 4 e 5. Escapes e LaTeX vazando

`Command: \*phase-b` (escape de markdown literal) e `$\rightarrow$` (LaTeX, que
o relatório não renderiza) apareciam crus. Corrigidos em `inline()`
(des-escapa pontuação de markdown, rodando **depois** das passadas de ênfase
para não entregar o asterisco solto ao regex de itálico) e via
`LATEX_LITERALS`, um mapa de comandos nomeados. Deliberadamente **não** é uma
regra genérica "`$...$` é matemática": isso casaria com as tabelas de custo
("$225,600 ... $120/hour") e apagaria os valores.

**Validação (run reportado, antes → depois):** emojis 9 → 0; LaTeX e escapes
restantes 0; Backlog 442 → 381 linhas com Effort Estimation 2 → 1 (mantida a
de 107 pts, do `*estimate`) e Staffing Plan 3 → 1; os 6 Epics e 14 Stories
preservados; 26 tabelas e 10 diagramas Mermaid intactos. A dedup foi rodada
contra as 5 fases de 2 runs distintos e só alterou a fase que de fato tinha
duplicação — nenhum falso positivo.

**Nota:** o rodapé desse run ainda mostrava "DPABB Framework / DABBA Studio"
apenas porque o run precedeu o commit `55b9f2d`; regenerado, já sai só
"DABBA Studio".
