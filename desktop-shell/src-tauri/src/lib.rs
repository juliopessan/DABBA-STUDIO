use tauri::Manager;
use tauri_plugin_shell::process::CommandChild;
use tauri_plugin_shell::ShellExt;

// Guarda o processo filho do agent-server para poder derrubá-lo quando o
// app sair — sem isso, fechar o app deixaria um processo Node órfão
// escutando na porta 8765.
struct AgentServerHandle(std::sync::Mutex<Option<CommandChild>>);

fn kill_sidecar(app: &tauri::AppHandle) {
  if let Some(handle) = app.state::<AgentServerHandle>().0.lock().unwrap().take() {
    let _ = handle.kill();
  }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_shell::init())
    .manage(AgentServerHandle(std::sync::Mutex::new(None)))
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      let (mut rx, child) = app
        .shell()
        .sidecar("agent-server")
        .expect("falha ao localizar o sidecar agent-server")
        .spawn()
        .expect("falha ao iniciar o agent-server");

      app.state::<AgentServerHandle>().0.lock().unwrap().replace(child);

      // Repassa stdout/stderr do agent-server para o log do Tauri, para
      // que erros do backend não desapareçam silenciosamente.
      tauri::async_runtime::spawn(async move {
        use tauri_plugin_shell::process::CommandEvent;
        while let Some(event) = rx.recv().await {
          match event {
            CommandEvent::Stdout(line) => log::info!("[agent-server] {}", String::from_utf8_lossy(&line)),
            CommandEvent::Stderr(line) => log::error!("[agent-server] {}", String::from_utf8_lossy(&line)),
            CommandEvent::Error(err) => log::error!("[agent-server] erro: {err}"),
            _ => {}
          }
        }
      });

      Ok(())
    })
    .build(tauri::generate_context!())
    .expect("error while building tauri application")
    // `RunEvent` cobre TODA saída do app (Cmd+Q, Sair pelo menu/dock,
    // `osascript quit`) — diferente de `WindowEvent::CloseRequested`, que só
    // dispara ao fechar uma janela específica pelo X e não é acionado por
    // esses outros caminhos de saída, deixando o sidecar órfão (bug real
    // encontrado ao testar: fechar via `osascript quit` matou a janela mas
    // o processo agent-server continuou rodando na porta 8765).
    .run(|app, event| {
      if let tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit = event {
        kill_sidecar(app);
      }
    });
}
