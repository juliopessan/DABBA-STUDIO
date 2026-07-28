# desktop-shell

Shell Tauri que empacota a GUI (`../gui`) e supervisiona o `agent-server`.

`src-tauri/tauri.conf.json` já está esboçado, mas o crate Rust
(`Cargo.toml`, `src/main.rs`) ainda não foi gerado. Para inicializar de
verdade:

```bash
npm install
npx tauri init
npx tauri dev
```

Requer o toolchain Rust (via [rustup](https://rustup.rs)) instalado na
máquina.
