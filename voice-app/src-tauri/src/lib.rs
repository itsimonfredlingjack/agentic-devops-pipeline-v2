mod api;
mod mic;

use mic::MicState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(MicState::default())
        .setup(|app| {
            // Give MicState access to the AppHandle for emitting events
            let mic_state = app.state::<MicState>();
            mic_state.set_app_handle(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            mic::start_mic,
            mic::stop_mic,
            api::send_audio,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
