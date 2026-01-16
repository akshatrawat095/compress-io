use tauri::{AppHandle, Emitter, WindowEvent};
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandEvent;
use std::path::Path;
use std::process::Command;

// --- HELPER: Test if an encoder actually works ---
// We keep this for Mac/AMD/Intel, but we SKIP it for NVIDIA below.
async fn is_encoder_supported(app: &AppHandle, encoder: &str) -> bool {
    let args = vec![
        "-f", "lavfi", "-i", "color=s=64x64:d=0.1", 
        "-c:v", encoder, 
        "-f", "null", "-"
    ];
    let output = app.shell().sidecar("ffmpeg")
        .expect("failed to create sidecar")
        .args(args)
        .output()
        .await;
    match output {
        Ok(o) => o.status.success(),
        Err(_) => false,
    }
}

// ==========================================
// 1. COMMAND: KILL FFMPEG
// ==========================================
#[tauri::command]
fn kill_ffmpeg() {
    println!("🛑 FORCE STOP: Killing all FFmpeg processes...");
    #[cfg(target_os = "windows")]
    { let _ = Command::new("taskkill").args(["/F", "/IM", "ffmpeg*", "/T"]).spawn(); }
    #[cfg(not(target_os = "windows"))]
    { let _ = Command::new("pkill").arg("-f").arg("ffmpeg").spawn(); }
}

// ==========================================
// 2. COMMAND: COMPRESS VIDEO (UNIVERSAL + FORCE NVIDIA)
// ==========================================
#[tauri::command]
async fn compress_video(app: AppHandle, input: String, output: String, auto_gpu: bool) -> Result<(), String> {
    let input_path = Path::new(&input);
    if !input_path.exists() {
        return Err("Input file not found".to_string());
    }

    println!("🎥 Starting Compression (Universal Force Mode)...");

    let ext = Path::new(&output)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    let mut selected_encoder = "libx264";
    let mut selected_audio = "aac";
    let mut selected_preset = "medium";
    let mut extra_args: Vec<String> = vec![];

    match ext.as_str() {
        // --- VIDEO FORMATS ---
        "mp4" | "mkv" | "mov" | "avi" | "flv" | "ts" | "m4v" | "wmv" => {
            if auto_gpu {
                // 🛑 LOGIC CHANGE: We check for NVIDIA *blindly* first.
                // We assume if you are on Windows, you might have it.
                // If this fails, it crashes (Good! The error tells us why).
                
                println!("💪 FORCING NVIDIA (Hybrid Mode + Pixel Fix)...");
                selected_encoder = "h264_nvenc";
                selected_preset = "p4";
                
                // PIXEL FIX (Prevents crash on 10-bit videos)
                extra_args.push("-pix_fmt".to_string());
                extra_args.push("yuv420p".to_string());

                // Note: If you want to support Mac/AMD correctly on other computers,
                // you would normally put checks here. But for YOUR laptop, we force NVIDIA.
            }
        },

        // --- WEB FORMATS ---
        "webm" => {
            println!("⚠️ WebM Format: Using VP9 Codec (CPU)");
            selected_encoder = "libvpx-vp9";
            selected_audio = "libopus";
            extra_args.push("-b:v".to_string()); extra_args.push("0".to_string());
            extra_args.push("-crf".to_string()); extra_args.push("30".to_string());
        },
        "ogv" | "ogg" => {
            println!("⚠️ Ogg Format: Using Theora Codec (CPU)");
            selected_encoder = "libtheora";
            selected_audio = "libvorbis";
            extra_args.push("-q:v".to_string()); extra_args.push("6".to_string());
        },
        "gif" => {
             println!("⚠️ GIF Detected: Using GIF Encoder");
             let args = vec![
                 "-i".to_string(), input.clone(),
                 "-vf".to_string(), "fps=15,scale=480:-1:flags=lanczos".to_string(),
                 "-y".to_string(), output.clone()
             ];
             let sidecar_command = app.shell().sidecar("ffmpeg").map_err(|e| e.to_string())?.args(args);
             let (mut rx, _) = sidecar_command.spawn().map_err(|e| e.to_string())?;
             while let Some(event) = rx.recv().await {
                 if let CommandEvent::Terminated(payload) = event {
                     if let Some(code) = payload.code {
                         if code != 0 { return Err(format!("GIF Error: {}", code)); }
                     }
                 }
             }
             return Ok(());
        },
        _ => {}
    }

    println!("⚡ Encoder: {}", selected_encoder);

    let mut args = vec![];
    // NO HARDWARE DECODE (CPU Reads -> Safe)
    
    args.push("-i".to_string());
    args.push(input.clone());
    args.push("-c:v".to_string());
    args.push(selected_encoder.to_string());

    if selected_encoder != "libvpx-vp9" && selected_encoder != "libtheora" && selected_encoder != "h264_videotoolbox" {
        args.push("-preset".to_string());
        args.push(selected_preset.to_string());
    }

    args.extend(extra_args);
    args.push("-c:a".to_string()); args.push(selected_audio.to_string());
    args.push("-y".to_string());
    args.push(output.clone());

    let sidecar_command = app.shell().sidecar("ffmpeg")
        .map_err(|e| e.to_string())?
        .args(args);

    let (mut rx, mut _child) = sidecar_command
        .spawn()
        .map_err(|e| e.to_string())?;

    let mut last_log_error = String::from("Unknown FFmpeg Error");

    while let Some(event) = rx.recv().await {
        match event {
            CommandEvent::Stderr(line_bytes) => {
                let line = String::from_utf8_lossy(&line_bytes);
                last_log_error = line.to_string(); 
                let _ = app.emit("ffmpeg-progress", line.to_string());
            }
            CommandEvent::Terminated(payload) => {
                if let Some(code) = payload.code {
                    if code != 0 {
                        return Err(format!("Error (Code {}): {}", code, last_log_error));
                    }
                }
            }
            _ => {}
        }
    }

    Ok(())
}

#[tauri::command]
async fn compress_image(app: AppHandle, input: String, output: String, width: String, height: String) -> Result<(), String> {
    let input_path = Path::new(&input);
    if !input_path.exists() {
        return Err("Input file not found".to_string());
    }
    let mut args = vec![ "-i".to_string(), input.clone() ];
    if width != "0" && !width.is_empty() {
        let h = if height.is_empty() || height == "0" { "-1" } else { &height };
        args.push("-vf".to_string());
        args.push(format!("scale={}:{}", width, h));
    }
    args.push("-y".to_string());
    args.push(output.clone());

    let sidecar_command = app.shell().sidecar("ffmpeg").map_err(|e| e.to_string())?.args(args);
    let (mut rx, mut _child) = sidecar_command.spawn().map_err(|e| e.to_string())?;

    while let Some(event) = rx.recv().await {
        if let CommandEvent::Stderr(line_bytes) = event {
            let line = String::from_utf8_lossy(&line_bytes);
            let _ = app.emit("ffmpeg-progress", line.to_string());
        }
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![compress_video, compress_image, kill_ffmpeg])
        .on_window_event(|_window, event| {
            if let WindowEvent::Destroyed = event {
                println!("❌ App Closing: Cleaning up processes...");
                #[cfg(target_os = "windows")]
                { let _ = Command::new("taskkill").args(["/F", "/IM", "ffmpeg*", "/T"]).spawn(); }
                #[cfg(not(target_os = "windows"))]
                { let _ = Command::new("pkill").arg("-f").arg("ffmpeg").spawn(); }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}