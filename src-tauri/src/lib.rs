use tauri::command;
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

#[command]
async fn compress_file(
    app: tauri::AppHandle,
    file_path: String,
    _width: String,
    _height: String,
    _target_size: String,
) -> Result<String, String> {
    // --- VIDEO ONLY LOGIC ---
    let output_path = file_path
        .rsplit_once('.')
        .map(|(base, ext)| format!("{}_comp.{}", base, ext))
        .unwrap_or_default();

    let sidecar_command = app
        .shell()
        .sidecar("ffmpeg")
        .map_err(|e| format!("Failed to create sidecar: {}", e))?
        .args([
            "-i",
            &file_path,
            "-vcodec",
            "libx264",
            "-crf",
            "28",
            &output_path,
        ]);

    let (mut rx, _) = sidecar_command
        .spawn()
        .map_err(|e| format!("Failed to spawn sidecar: {}", e))?;

    while let Some(event) = rx.recv().await {
        if let CommandEvent::Terminated(payload) = event {
            if payload.code == Some(0) {
                return Ok("Compression Successful".to_string());
            } else {
                return Err(format!("Process failed with code {:?}", payload.code));
            }
        }
    }

    Ok("Process finished".to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        // --- FIXED LINE BELOW ---
        .plugin(tauri_plugin_updater::Builder::new().build()) 
        .plugin(tauri_plugin_process::init()) 
        // -------------------------
        .invoke_handler(tauri::generate_handler![compress_file])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}