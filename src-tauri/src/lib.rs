use tauri::{AppHandle, Emitter, WindowEvent};
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandEvent;
use std::path::Path;
use std::process::Command;

// --- HELPER: Smart Check to see what GPU the user has ---
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
// 2. COMMAND: COMPRESS VIDEO (TRUE UNIVERSAL + SAFE)
// ==========================================
#[tauri::command]
async fn compress_video(app: AppHandle, input: String, output: String, auto_gpu: bool) -> Result<(), String> {
    let input_path = Path::new(&input);
    if !input_path.exists() {
        return Err("Input file not found".to_string());
    }

    println!("🎥 Starting Universal Compression...");

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
        // --- STANDARD VIDEO FORMATS (MP4, MKV, MOV, etc.) ---
        "mp4" | "mkv" | "mov" | "avi" | "flv" | "ts" | "m4v" | "wmv" => {
            
            // ✅ PLAYBACK FIX: Force standard pixels for EVERYONE.
            // This ensures videos play on TVs, iPhones, and Windows Media Player.
            extra_args.push("-pix_fmt".to_string()); 
            extra_args.push("yuv420p".to_string());

            if auto_gpu {
                // 1. CHECK FOR NVIDIA (Best for Windows)
                if is_encoder_supported(&app, "h264_nvenc").await {
                    println!("✅ NVIDIA GPU Detected");
                    selected_encoder = "h264_nvenc";
                    selected_preset = "p4";
                } 
                // 2. CHECK FOR MAC (Apple Silicon / Intel Mac)
                else if is_encoder_supported(&app, "h264_videotoolbox").await {
                    println!("✅ Apple Hardware Detected");
                    selected_encoder = "h264_videotoolbox";
                    extra_args.push("-q:v".to_string()); extra_args.push("55".to_string());
                } 
                // 3. CHECK FOR AMD (Radeon)
                else if is_encoder_supported(&app, "h264_amf").await {
                    println!("✅ AMD GPU Detected");
                    selected_encoder = "h264_amf";
                    extra_args.push("-usage".to_string()); extra_args.push("transcoding".to_string());
                } 
                // 4. CHECK FOR INTEL (QuickSync - iGPUs)
                else if is_encoder_supported(&app, "h264_qsv").await {
                    println!("✅ Intel QuickSync Detected");
                    selected_encoder = "h264_qsv";
                    extra_args.push("-global_quality".to_string()); extra_args.push("25".to_string());
                } else {
                    println!("⚠️ No GPU found. Falling back to CPU.");
                }
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
    if !input_path.exists() { return Err("Input file not found".to_string()); }
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