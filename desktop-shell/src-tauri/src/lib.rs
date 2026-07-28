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

fn spawn_agent_server(app: &tauri::AppHandle) {
  // cwd explícito: sem isso, o sidecar herda o cwd do processo que abriu o
  // app (pode ser "/" se aberto via `open` de um volume .dmg montado, ou
  // outro diretório imprevisível) — encontrado depurando um travamento real
  // do agent-server a ~100% de CPU indefinidamente quando rodado assim.
  // O diretório home é gravável e existe em qualquer instalação.
  let home_dir = dirs::home_dir().unwrap_or_else(|| std::path::PathBuf::from("/tmp"));

  let (mut rx, child) = app
    .shell()
    .sidecar("agent-server")
    .expect("falha ao localizar o sidecar agent-server")
    .current_dir(home_dir)
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
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    // Precisa ser o primeiro plugin registrado (requisito da própria lib).
    // Impede que uma segunda instância do app abra — se o usuário clicar
    // no ícone várias vezes (comportamento observado na prática), a
    // segunda tentativa só foca a janela já aberta em vez de spawnar um
    // segundo sidecar concorrendo pela mesma porta/banco SQLite.
    .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
      if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_focus();
        let _ = window.unminimize();
      }
    }))
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

      spawn_agent_server(app.handle());
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
