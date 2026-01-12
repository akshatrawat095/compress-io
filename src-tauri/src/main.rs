#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use std::path::Path;
use std::sync::{Arc, Mutex};
use tauri::{Emitter, State};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

// State to manage the active process so we can stop it
pub struct AppState {
    pub child_process: Arc<Mutex<Option<CommandChild>>>,
}

#[tauri::command]
async fn stop_compression(state: State<'_, AppState>) -> Result<String, String> {
    let mut lock = state.child_process.lock().unwrap();
    if let Some(child) = lock.take() {
        child.kill().map_err(|e| e.to_string())?;
        Ok("Process Terminated".to_string())
    } else {
        Err("No active process to stop".to_string())
    }
}

#[tauri::command]
async fn compress_file(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    file_path: String,
    width: String,
    height: String,
    target_size: String,
) -> Result<String, String> {
    let path_obj = Path::new(&file_path);
    let stem = path_obj.file_stem().ok_or("No filename")?.to_str().unwrap();
    let parent = path_obj.parent().unwrap_or(Path::new("./"));
    let original_ext = path_obj
        .extension()
        .unwrap_or_default()
        .to_str()
        .unwrap()
        .to_lowercase();

    // STRICT SIZE LOGIC: Only applied for images
    let target_kb: f64 = target_size.parse().unwrap_or(0.0);
    let target_bytes = (target_kb * 1024.0) as u64;

    let (output_str, command) = match original_ext.as_str() {
        "pdf" => {
            let out = parent
                .join(format!("{}_compressed.pdf", stem))
                .to_str()
                .unwrap()
                .to_string();
            let sidecar = app.shell().sidecar("gs").map_err(|e| e.to_string())?;

            // FIXED: Create output_arg as an owned String to avoid "dropped while borrowed" error
            let output_arg = format!("-sOutputFile={}", out);
            let args = vec![
                "-sDEVICE=pdfwrite".to_string(),
                "-dPDFSETTINGS=/screen".to_string(),
                "-dNOPAUSE".to_string(),
                "-dQUIET".to_string(),
                "-dBATCH".to_string(),
                output_arg,
                file_path,
            ];
            (out, sidecar.args(args))
        }
        _ => {
            let out = parent
                .join(format!("{}_compressed.{}", stem, original_ext))
                .to_str()
                .unwrap()
                .to_string();
            let sidecar = app.shell().sidecar("ffmpeg").map_err(|e| e.to_string())?;

            // HARDWARE OPTIMIZATION: GPU priority with CPU fallback
            let mut args = vec![
                "-hwaccel".to_string(),
                "auto".to_string(),
                "-threads".to_string(),
                "0".to_string(),
                "-i".to_string(),
                file_path,
                "-preset".to_string(),
                "superfast".to_string(),
            ];

            let is_image = matches!(original_ext.as_str(), "jpg" | "jpeg" | "png" | "webp");

            // Only images get the strict "-fs" size limit
            if is_image && target_bytes > 0 {
                args.push("-fs".to_string());
                args.push(target_bytes.to_string());
            }

            // Dimensions logic (Image only via frontend restriction)
            if width != "0" && !width.is_empty() || height != "0" && !height.is_empty() {
                let w = if width == "0" || width.is_empty() {
                    "-1"
                } else {
                    &width
                };
                let h = if height == "0" || height.is_empty() {
                    "-1"
                } else {
                    &height
                };
                args.push("-vf".to_string());
                args.push(format!("scale={}:{}", w, h));
            }

            args.push(out.clone());
            (out, sidecar.args(args))
        }
    };

    let (mut rx, child) = command.spawn().map_err(|e| e.to_string())?;

    // Store child for stopping later
    *state.child_process.lock().unwrap() = Some(child);

    while let Some(event) = rx.recv().await {
        if let CommandEvent::Stderr(line_bytes) = event {
            let line = String::from_utf8_lossy(&line_bytes).to_string();
            let _ = app.emit("compression-log", line);
        }
    }

    Ok(output_str)
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(AppState {
            child_process: Arc::new(Mutex::new(None)),
        })
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![compress_file, stop_compression])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
