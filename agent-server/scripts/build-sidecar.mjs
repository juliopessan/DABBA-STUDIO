#!/usr/bin/env node
// Empacota o agent-server (Node/Express) como um executável standalone via
// Node SEA (Single Executable Application), no nome/formato que o Tauri
// espera para um sidecar: binaries/agent-server-<target-triple>.
//
// Passos: bundlar tudo num único CJS (esbuild) → gerar o blob SEA → copiar
// o binário do Node → injetar o blob nele (postject) → re-assinar (macOS
// invalida a assinatura ao alterar o binário).
import { execFileSync } from "node:child_process";
import { chmodSync, copyFileSync, mkdirSync, readdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const BUILD_DIR = path.join(ROOT, ".sidecar-build");
// Fora de BUILD_DIR (que é limpo a cada build) — o binário oficial do Node
// tem ~130MB, não vale a pena rebaixar a cada `npm run build:sidecar`.
const NODE_CACHE_DIR = path.join(ROOT, ".sidecar-cache");
const BINARIES_DIR = path.resolve(ROOT, "../desktop-shell/src-tauri/binaries");
const NODE_VERSION = "v25.8.1";

function sh(cmd, args) {
  console.log(`$ ${cmd} ${args.join(" ")}`);
  execFileSync(cmd, args, { stdio: "inherit" });
}

function rustTargetTriple() {
  const rustupBin = "/opt/homebrew/opt/rustup/bin/rustc";
  const rustc = existsSync(rustupBin) ? rustupBin : "rustc";
  const out = execFileSync(rustc, ["-vV"], { encoding: "utf-8" });
  const match = out.match(/host: (\S+)/);
  if (!match) throw new Error("não foi possível determinar o target triple via `rustc -vV`");
  return match[1];
}

// O Node do sistema (Homebrew, nvm, etc.) costuma ser linkado dinamicamente
// contra dylibs do próprio gerenciador de pacotes (libnode, openssl, icu4c…)
// em caminhos absolutos daquela máquina — copiar esse binário para outra
// máquina simplesmente não funciona lá. O binário oficial do nodejs.org é
// estático (só linka frameworks do próprio macOS), que é o que a
// documentação de Node SEA recomenda para builds redistribuíveis.
function nodePlatformArch() {
  const platform = process.platform === "win32" ? "win" : process.platform;
  const arch = process.arch; // "arm64" | "x64"
  return { platform, arch };
}

async function officialNodeBinaryPath() {
  const { platform, arch } = nodePlatformArch();
  const dirName = `node-${NODE_VERSION}-${platform}-${arch}`;
  const cacheDir = NODE_CACHE_DIR;
  const binPath = path.join(cacheDir, dirName, "bin", platform === "win" ? "node.exe" : "node");
  if (existsSync(binPath)) return binPath;

  mkdirSync(cacheDir, { recursive: true });
  const ext = platform === "win" ? "zip" : "tar.gz";
  const url = `https://nodejs.org/dist/${NODE_VERSION}/${dirName}.${ext}`;
  const archivePath = path.join(cacheDir, `node.${ext}`);
  console.log(`baixando Node oficial (estático) de ${url}...`);
  sh("curl", ["-sL", url, "-o", archivePath]);
  if (ext === "tar.gz") sh("tar", ["-xzf", archivePath, "-C", cacheDir]);
  else sh("unzip", ["-q", archivePath, "-d", cacheDir]);
  return binPath;
}

async function main() {
  rmSync(BUILD_DIR, { recursive: true, force: true });
  mkdirSync(BUILD_DIR, { recursive: true });
  mkdirSync(BINARIES_DIR, { recursive: true });

  console.log("1/5 — bundlando agent-server num único arquivo CJS...");
  await esbuild.build({
    entryPoints: [path.join(ROOT, "src/index.ts")],
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node22",
    outfile: path.join(BUILD_DIR, "bundle.cjs"),
    // node:sqlite e demais `node:*` builtins ficam automaticamente
    // externos ao bundle (resolvidos pelo runtime, não pelo esbuild).
  });

  console.log("2/5 — gerando configuração e blob SEA (personas embutidas como assets)...");
  // O executável SEA é um blob único — não há "arquivo ao lado" para o
  // runtime ler personas/*.md do disco. Cada persona vira um asset
  // embutido (chave `persona-<id>.md`), mais um manifest listando os ids
  // para o loader saber quais assets pedir (ver src/agents/loader.ts).
  const personasDir = path.join(ROOT, "personas");
  const personaIds = readdirSync(personasDir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.replace(/\.md$/, ""));

  const manifestPath = path.join(BUILD_DIR, "personas-manifest.json");
  writeFileSync(manifestPath, JSON.stringify(personaIds));

  const assets = { "personas-manifest.json": manifestPath };
  for (const id of personaIds) assets[`persona-${id}.md`] = path.join(personasDir, `${id}.md`);

  const seaConfigPath = path.join(BUILD_DIR, "sea-config.json");
  const blobPath = path.join(BUILD_DIR, "sea-prep.blob");
  writeFileSync(
    seaConfigPath,
    JSON.stringify(
      {
        main: path.join(BUILD_DIR, "bundle.cjs"),
        output: blobPath,
        disableExperimentalSEAWarning: true,
        assets,
      },
      null,
      2
    )
  );
  sh(process.execPath, ["--experimental-sea-config", seaConfigPath]);

  const triple = rustTargetTriple();
  const ext = process.platform === "win32" ? ".exe" : "";
  const outBinary = path.join(BINARIES_DIR, `agent-server-${triple}${ext}`);

  const nodeBinary = await officialNodeBinaryPath();
  console.log(`3/5 — copiando o binário oficial do Node (${nodeBinary}) para ${outBinary}...`);
  copyFileSync(nodeBinary, outBinary);
  chmodSync(outBinary, 0o755);

  if (process.platform === "darwin") {
    console.log("4/5 — removendo assinatura existente (necessário antes de injetar o blob)...");
    sh("codesign", ["--remove-signature", outBinary]);
  }

  console.log("5/5 — injetando o blob no binário via postject...");
  // npm workspaces içam devDependencies compartilhadas para o node_modules
  // da raiz do monorepo — não necessariamente para agent-server/node_modules.
  const postjectCli = [
    path.join(ROOT, "node_modules/postject/dist/cli.js"),
    path.join(ROOT, "../node_modules/postject/dist/cli.js"),
  ].find(existsSync);
  if (!postjectCli) throw new Error("postject não encontrado (nem local nem na raiz do monorepo)");
  sh(process.execPath, [
    postjectCli,
    outBinary,
    "NODE_SEA_BLOB",
    blobPath,
    "--sentinel-fuse",
    "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2",
    ...(process.platform === "darwin" ? ["--macho-segment-name", "NODE_SEA"] : []),
  ]);

  if (process.platform === "darwin") {
    console.log("re-assinando (ad-hoc) após a injeção...");
    sh("codesign", ["--sign", "-", outBinary]);
  }

  console.log(`\nsidecar pronto: ${outBinary}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
