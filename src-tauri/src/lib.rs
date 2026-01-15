use tauri::{AppHandle, Emitter};
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandEvent;
use std::path::Path;

// --- HELPER: Test if an encoder actually works on this machine ---
async fn is_encoder_supported(app: &AppHandle, encoder: &str) -> bool {
    // We try to encode 1 frame of black video. If it succeeds, the GPU works.
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
// 1. COMMAND: COMPRESS VIDEO (SMART AUTO)
// ==========================================
#[tauri::command]
async fn compress_video(app: AppHandle, input: String, output: String, auto_gpu: bool) -> Result<(), String> {
    let input_path = Path::new(&input);
    if !input_path.exists() {
        return Err("Input file not found".to_string());
    }

    println!("🎥 Starting Video Compression...");

    // DEFAULT SETTINGS (CPU)
    let mut selected_encoder = "libx264";
    let mut selected_preset = "medium";
    let mut extra_args: Vec<String> = vec![];

    // IF USER CHECKED "AUTO GPU" -> WE PROBE HARDWARE
    if auto_gpu {
        println!("🕵️ Scanning hardware for acceleration...");
        
        // 1. Try NVIDIA (Most common for high-performance)
        if is_encoder_supported(&app, "h264_nvenc").await {
            println!("✅ NVIDIA GPU Detected (NVENC)");
            selected_encoder = "h264_nvenc";
            selected_preset = "p4"; // Balanced GPU preset
        } 
        // 2. Try Apple Silicon / Mac (M1/M2/M3)
        else if is_encoder_supported(&app, "h264_videotoolbox").await {
            println!("✅ Apple Hardware Detected (VideoToolbox)");
            selected_encoder = "h264_videotoolbox";
            // Apple uses 'quality' instead of presets
            extra_args.push("-q:v".to_string());
            extra_args.push("55".to_string());
        }
        // 3. Try AMD (Radeon)
        else if is_encoder_supported(&app, "h264_amf").await {
            println!("✅ AMD GPU Detected (AMF)");
            selected_encoder = "h264_amf";
            extra_args.push("-usage".to_string());
            extra_args.push("transcoding".to_string());
        }
        // 4. Try Intel QuickSync (Common on Laptops)
        else if is_encoder_supported(&app, "h264_qsv").await {
            println!("✅ Intel QuickSync Detected (QSV)");
            selected_encoder = "h264_qsv";
            extra_args.push("-global_quality".to_string());
            extra_args.push("25".to_string());
        } 
        else {
            println!("⚠️ No supported GPU found. Falling back to CPU.");
        }
    }

    println!("⚡ Selected Encoder: {}", selected_encoder);

    // --- BUILD ARGUMENTS ---
    let mut args = vec![
        "-i".to_string(),
        input.clone(),
        "-c:v".to_string(),
        selected_encoder.to_string(),
    ];

    // Add preset if it's not Apple (Apple uses specific flags handled above)
    if selected_encoder != "h264_videotoolbox" {
        args.push("-preset".to_string());
        args.push(selected_preset.to_string());
    }

    // Add specific extra args (Quality/Usage flags)
    args.extend(extra_args);

    // Standard Audio & Output settings
    args.push("-c:a".to_string());
    args.push("aac".to_string());
    args.push("-y".to_string());
    args.push(output.clone());

    // --- EXECUTE ---
    let sidecar_command = app.shell().sidecar("ffmpeg")
        .map_err(|e| e.to_string())?
        .args(args);

    let (mut rx, mut _child) = sidecar_command
        .spawn()
        .map_err(|e| e.to_string())?;

    while let Some(event) = rx.recv().await {
        if let CommandEvent::Stderr(line_bytes) = event {
            let line = String::from_utf8_lossy(&line_bytes);
            let _ = app.emit("ffmpeg-progress", line.to_string());
        }
    }

    Ok(())
}

// ==========================================
// 2. COMMAND: COMPRESS IMAGE
// ==========================================
#[tauri::command]
async fn compress_image(app: AppHandle, input: String, output: String, width: String, height: String) -> Result<(), String> {
    let input_path = Path::new(&input);
    if !input_path.exists() {
        return Err("Input file not found".to_string());
    }

    let mut args = vec![
        "-i".to_string(),
        input.clone(),
    ];

    if width != "0" && !width.is_empty() {
        let h = if height.is_empty() || height == "0" { "-1" } else { &height };
        args.push("-vf".to_string());
        args.push(format!("scale={}:{}", width, h));
    }

    args.push("-y".to_string());
    args.push(output.clone());

    let sidecar_command = app.shell().sidecar("ffmpeg")
        .map_err(|e| e.to_string())?
        .args(args);

    let (mut rx, mut _child) = sidecar_command
        .spawn()
        .map_err(|e| e.to_string())?;

    while let Some(event) = rx.recv().await {
        if let CommandEvent::Stderr(line_bytes) = event {
            let line = String::from_utf8_lossy(&line_bytes);
            let _ = app.emit("ffmpeg-progress", line.to_string());
        }
    }

    Ok(())
}

// ==========================================
// 3. MAIN RUNNER
// ==========================================
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![compress_video, compress_image])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}