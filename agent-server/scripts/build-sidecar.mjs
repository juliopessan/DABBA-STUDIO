#!/usr/bin/env node
// Packages the agent-server (Node/Express) as a standalone executable via
// Node SEA (Single Executable Application), no nome/formato que o Tauri
// espera para um sidecar: binaries/agent-server-<target-triple>.
//
// Steps: bundle everything into a single CJS file (esbuild) → generate the
// SEA blob → copy the Node binary → inject the blob into it (postject) →
// re-sign (macOS invalidates the signature when the binary changes).
import { execFileSync } from "node:child_process";
import { chmodSync, copyFileSync, mkdirSync, readdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const BUILD_DIR = path.join(ROOT, ".sidecar-build");
// Outside BUILD_DIR (which is wiped on every build) — the official Node
// binary is ~130MB, not worth re-downloading on every `npm run build:sidecar`.
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
  if (!match) throw new Error("could not determine the target triple via `rustc -vV`");
  return match[1];
}

// O Node do sistema (Homebrew, nvm, etc.) costuma ser linkado dinamicamente
// against its own package manager's dylibs (libnode, openssl, icu4c…) at
// absolute paths on that machine — copying that binary to another machine
// simply does not work there. The official nodejs.org binary is static (it
// only links macOS's own frameworks), which is what the Node SEA docs
// recommend for redistributable builds.
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
  console.log(`downloading official (static) Node from ${url}…`);
  sh("curl", ["-sL", url, "-o", archivePath]);
  if (ext === "tar.gz") sh("tar", ["-xzf", archivePath, "-C", cacheDir]);
  else sh("unzip", ["-q", archivePath, "-d", cacheDir]);
  return binPath;
}

async function main() {
  rmSync(BUILD_DIR, { recursive: true, force: true });
  mkdirSync(BUILD_DIR, { recursive: true });
  mkdirSync(BINARIES_DIR, { recursive: true });

  console.log("1/5 — bundling agent-server into a single CJS file…");
  await esbuild.build({
    entryPoints: [path.join(ROOT, "src/index.ts")],
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node22",
    outfile: path.join(BUILD_DIR, "bundle.cjs"),
    // node:sqlite e demais `node:*` builtins ficam automaticamente
    // external to the bundle (resolved by the runtime, not by esbuild).
  });

  console.log("2/5 — generating SEA config and blob (personas embedded as assets)…");
  // The SEA executable is a single blob — there is no "file next to it" for the
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
  console.log(`3/5 — copying the official Node binary (${nodeBinary}) to ${outBinary}…`);
  copyFileSync(nodeBinary, outBinary);
  chmodSync(outBinary, 0o755);

  if (process.platform === "darwin") {
    console.log("4/5 — removing the existing signature (required before injecting the blob)…");
    sh("codesign", ["--remove-signature", outBinary]);
  }

  console.log("5/5 — injecting the blob into the binary via postject…");
  // npm workspaces hoist shared devDependencies to the monorepo root's
  // node_modules — not necessarily to agent-server/node_modules.
  const postjectCli = [
    path.join(ROOT, "node_modules/postject/dist/cli.js"),
    path.join(ROOT, "../node_modules/postject/dist/cli.js"),
  ].find(existsSync);
  if (!postjectCli) throw new Error("postject not found (neither local nor at the monorepo root)");
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
    console.log("re-signing (ad-hoc) after injection…");
    sh("codesign", ["--sign", "-", outBinary]);
  }

  console.log(`\nsidecar ready: ${outBinary}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
