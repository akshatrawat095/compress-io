use tauri::{AppHandle, Emitter, Manager, WindowEvent, State};
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandEvent;
use std::path::Path;
use std::process::Command as StdCommand;
use std::sync::Mutex;
use std::collections::HashMap;
use std::fs::DirEntry;

struct EncoderCache(Mutex<HashMap<String, bool>>);

// --- DIAGNOSTIC HELPER: Checks and PRINTS GPU status ---
async fn is_encoder_supported(app: &AppHandle, cache: &State<'_, EncoderCache>, encoder: &str) -> bool {
    {
        let cache_map = cache.0.lock().unwrap();
        if let Some(&supported) = cache_map.get(encoder) {
            return supported;
        }
    }

    println!("🔍 DIAGNOSTIC: Checking support for encoder: {}", encoder);
    
    let args = vec![
        "-f", "lavfi", "-i", "color=s=1280x720:d=0.1", 
        "-c:v", encoder, 
        "-f", "null", "-"
    ];
    
    let sidecar = app.shell().sidecar("ffmpeg");
    if sidecar.is_err() {
        println!("❌ DIAGNOSTIC: Could not find FFmpeg sidecar!");
        return false;
    }

    let output = sidecar.unwrap().args(args).output().await;
    let supported = match output {
        Ok(o) => o.status.success(),
        Err(_) => false,
    };

    if supported {
        println!("✅ DIAGNOSTIC: {} is WORKING!", encoder);
    } else {
        println!("❌ DIAGNOSTIC: {} FAILED!", encoder);
    }

    let mut cache_map = cache.0.lock().unwrap();
    cache_map.insert(encoder.to_string(), supported);
    supported
}

#[tauri::command]
fn stop_job() {
    println!("🛑 FORCE STOP: Killing all media processes...");
    #[cfg(target_os = "windows")]
    { 
        let _ = StdCommand::new("cmd").args(["/C", "taskkill /F /T /IM ffmpeg*"]).spawn(); 
        let _ = StdCommand::new("cmd").args(["/C", "taskkill /F /T /IM realesrgan*"]).spawn();
    }
    #[cfg(not(target_os = "windows"))]
    { 
        let _ = StdCommand::new("pkill").arg("-9").arg("-f").arg("ffmpeg").spawn(); 
        let _ = StdCommand::new("pkill").arg("-9").arg("-f").arg("realesrgan").spawn();
    }
}

// 🟢 THE AI ENHANCER COMMAND (FIXED TO USE AVAILABLE MODELS)
#[tauri::command]
async fn enhance_image(
    app: AppHandle,
    input: String,
    output: String,
    scale: String,
    format: String,
    model_type: String, 
    face_restore: bool, 
    hyper_detail: bool,
    tile_size: String,
) -> Result<(), String> {
    println!("✨ DIAGNOSTIC: Enhance Image Function Called");

    let resource_dir = app.path().resource_dir().map_err(|e| e.to_string())?;
    let mut engine_path = resource_dir.join("binaries").join("ai_engine").join("realesrgan-ncnn-vulkan");

    #[cfg(target_os = "windows")]
    { engine_path.set_extension("exe"); }

    if !engine_path.exists() {
        return Err(format!("AI engine not found at {:?}", engine_path));
    }

    let model_name = match model_type.as_str() {
        "anime" => "realesr-animevideov3-x4",  
        _ => "realesrgan-x4plus" 
    };

    let mut command = StdCommand::new(engine_path);
    command.arg("-i").arg(input)
           .arg("-o").arg(output)
           .arg("-s").arg(&scale)
           .arg("-f").arg(&format)
           .arg("-n").arg(model_name)
           .arg("-t").arg(&tile_size); 

    if hyper_detail {
        command.arg("-x"); 
    }

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }

    command.stdout(std::process::Stdio::piped());
    command.stderr(std::process::Stdio::piped());

    println!("🚀 DIAGNOSTIC: Starting AI Process with model: {}", model_name);
    
    let mut child = command.spawn().map_err(|e| format!("Failed to spawn AI: {}", e))?;

    if let Some(mut stderr) = child.stderr.take() {
        use std::io::Read;
        let mut buffer: [u8; 256] = [0; 256];
        let mut current_line = String::new();
        while let Ok(n) = stderr.read(&mut buffer) {
            if n == 0 { break; }
            let chunk = String::from_utf8_lossy(&buffer[..n]);
            for c in chunk.chars() {
                if c == '\r' || c == '\n' || c == '%' {
                    if c == '%' { current_line.push(c); }
                    if !current_line.trim().is_empty() {
                        let _ = app.emit("enhance-progress", current_line.clone());
                    }
                    current_line.clear();
                } else {
                    current_line.push(c);
                }
            }
        }
    }

    let status = child.wait().map_err(|e| format!("Wait failed: {}", e))?;

    if status.success() {
        println!("✅ DIAGNOSTIC: AI Enhancement Complete!");
        Ok(())
    } else {
        Err(format!("AI Engine Error: Process exited with code {:?}", status.code()))
    }
}

fn get_system_vram_mb() -> u64 {
    #[cfg(target_os = "windows")]
    {
        if let Ok(output) = StdCommand::new("wmic")
            .args(["path", "win32_VideoController", "get", "AdapterRAM"])
            .output()
        {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let mut max_vram: u64 = 0;
            for line in stdout.lines() {
                if let Ok(bytes) = line.trim().parse::<u64>() {
                    let mb = bytes / (1024 * 1024);
                    if mb > max_vram {
                        max_vram = mb;
                    }
                }
            }
            if max_vram > 0 {
                return max_vram;
            }
        }
        return 4096; // Fallback to safe 4GB constraint if probe fails
    }
    
    #[cfg(target_os = "macos")]
    {
        return 8192; // Apple Silicon relies on unified memory, usually >8GB
    }
    
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        4096 // Linux generic fallback
    }
}

#[tauri::command]
async fn enhance_video(
    app: AppHandle,
    cache: State<'_, EncoderCache>,
    input: String,
    output: String,
    ai_scale: String,
    model_type: String, 
    _face_restore: bool, 
    ai_fps: String,
    denoise: bool,
    stabilize: bool,
    hyper_detail: bool,
    tile_size: String,
    auto_gpu: bool,
) -> Result<(), String> {
    println!("✨ TURBO ENGINE: Starting Video Enhancement Phase");

    let ts = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis();
    let base_temp = app.path().temp_dir().map_err(|e| e.to_string())?;
    let temp_dir_path = base_temp.join(format!("ai_enhance_{}", ts));
    std::fs::create_dir_all(&temp_dir_path).map_err(|e| e.to_string())?;
    
    let input_frames_dir = temp_dir_path.join("input_frames");
    let output_frames_dir = temp_dir_path.join("output_frames");
    std::fs::create_dir_all(&input_frames_dir).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&output_frames_dir).map_err(|e| e.to_string())?;
    let audio_path = temp_dir_path.join("audio.aac");

    let _ = app.emit("enhance-progress", "Parsing metadata...");

    let _ = app.emit("enhance-progress", "Analyzing video stream...");

    // 1. Probe Metadata (FPS & Estimating Total Frames)
    let probe_cmd = app.shell().sidecar("ffmpeg").map_err(|e| e.to_string())?.args(vec!["-hwaccel", "auto", "-i", &input]);
    let probe_out = probe_cmd.output().await.map_err(|e| e.to_string())?;
    let probe_str = String::from_utf8_lossy(&probe_out.stderr);
    
    let mut fps: f64 = 30.0;
    if let Some(fps_idx) = probe_str.find(" fps") {
        let snippet = &probe_str[..fps_idx];
        if let Some(comma_idx) = snippet.rfind(',') {
            fps = snippet[comma_idx+1..].trim().parse::<f64>().unwrap_or(30.0);
        }
    }

    let mut total_frames: u64 = 0;
    if let Some(duration_idx) = probe_str.find("Duration: ") {
        let snippet = &probe_str[duration_idx+10..duration_idx+21];
        let parts: Vec<&str> = snippet.split(':').collect();
        if parts.len() == 3 {
            let h = parts[0].parse::<f64>().unwrap_or(0.0);
            let m = parts[1].parse::<f64>().unwrap_or(0.0);
            let s = parts[2].parse::<f64>().unwrap_or(0.0);
            let total_seconds = (h * 3600.0) + (m * 60.0) + s;
            total_frames = (total_seconds * fps).round() as u64;
        }
    }
    
    if total_frames > 0 {
        let _ = app.emit("enhance-progress", format!("Prep: Count:{}", total_frames));
    }

    // 2. Extract Audio
    let _ = app.emit("enhance-progress", "Separating audio track...");
    let mut audio_cmd = app.shell().sidecar("ffmpeg").map_err(|e| e.to_string())?.args(vec![
        "-y", "-hwaccel", "auto", "-i", &input, "-vn", "-c:a", "copy", audio_path.to_str().unwrap()
    ]);
    let audio_status = audio_cmd.output().await.map_err(|e| e.to_string())?;
    let has_audio = audio_path.exists() && audio_status.status.success();

    // 3. Extract Frames with Live Progress
    let _ = app.emit("enhance-progress", "Extracting frames... (Hold tight)");
    let frames_pattern = input_frames_dir.join("frame_%08d.jpg");
    
    let mut vf_chain = "scale=-2:'min(1080,ih)'".to_string();
    if stabilize {
        let trf_path = temp_dir_path.join("transform.trf").to_str().unwrap().replace("\\", "/");
        let mut stab_cmd = app.shell().sidecar("ffmpeg").map_err(|e| e.to_string())?.args(vec![
            "-y", "-hwaccel", "auto", "-i", &input,
            "-vf", &format!("vidstabdetect=stepsize=32:shakiness=10:accuracy=10:result={}", trf_path),
            "-f", "null", "-"
        ]);
        let _ = stab_cmd.output().await;
        vf_chain = format!("vidstabtransform=input={}:optzoom=1:zoomspeed=0.2:smoothing=10,{}", trf_path, vf_chain);
    }
    if denoise {
        vf_chain = format!("hqdn3d=4.0:3.0:6.0:4.5,{}", vf_chain);
    }

    let mut frames_cmd = app.shell().sidecar("ffmpeg").map_err(|e| e.to_string())?.args(vec![
        "-y", "-hwaccel", "auto", "-i", &input, 
        "-threads", "4", 
        "-vf", &vf_chain, 
        "-progress", "pipe:1", 
        "-vsync", "0", frames_pattern.to_str().unwrap()
    ]);

    let (mut rx, _) = frames_cmd.spawn().map_err(|e| e.to_string())?;
    while let Some(event) = rx.recv().await {
        if let CommandEvent::Stdout(line_bytes) = event {
            let line = String::from_utf8_lossy(&line_bytes);
            if line.contains("frame=") {
                let frame_str = line.split("frame=").last().unwrap_or("").trim().split(' ').next().unwrap_or("");
                let _ = app.emit("enhance-progress", format!("Prep: Processing:{}", frame_str));
            }
        }
    }

    // New: Physical Reconcile - Overwrite estimation with reality
    let actual_files: Vec<_> = std::fs::read_dir(&input_frames_dir)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .collect();
    let total_frames = actual_files.len();
    let _ = app.emit("enhance-progress", format!("Prep: Finalized:{}", total_frames));

    // 4. Turbo Parallel Enhancement (Hardware-Aware Throttling)
    let _ = app.emit("enhance-progress", "Analyzing GPU Core Capacity...");
    let vram_mb = get_system_vram_mb();
    
    // Scale lanes based on actual memory capacity to prevent vkQueueSubmit -4 (Device Lost)
    let num_chunks = if vram_mb >= 10000 {
        4 // High-end Desktop (3080/4080+)
    } else if vram_mb >= 6000 {
        2 // Mid-tier Desktop / High-end Laptop (3060/3070)
    } else {
        1 // Entry-level Laptop (RTX 2050/3050 - 4GB VRAM)
    };

    let auto_tile_size = if vram_mb >= 8000 { "400" } else { "200" }; 
    let final_tile = if tile_size == "0" || tile_size.is_empty() { auto_tile_size.to_string() } else { tile_size };
    let thread_map = if vram_mb >= 8000 { "1:4:4" } else { "1:2:2" };

    let _ = app.emit("enhance-progress", format!("Turbo Engine Adjusted: {} Processing Lanes (VRAM: {}MB).", num_chunks, vram_mb));

    let resource_dir = app.path().resource_dir().map_err(|e| e.to_string())?;
    let mut engine_path = resource_dir.join("binaries").join("ai_engine").join("realesrgan-ncnn-vulkan");
    if cfg!(target_os = "windows") { engine_path.set_extension("exe"); }

    let model_name = match model_type.as_str() {
        "anime" => "realesr-animevideov3-x4",
        _ => "realesrgan-x4plus"
    };

    let mut frame_files: Vec<std::fs::DirEntry> = std::fs::read_dir(&input_frames_dir)
        .map_err(|e| e.to_string())?
        .filter_map(|entry| entry.ok())
        .collect();
    frame_files.sort_by_key(|a| a.path());
    // total_frames is already updated by the reconcile step above

    let chunk_size = (total_frames as f64 / num_chunks as f64).ceil() as usize;
    let mut children = vec![];

    for i in 0..num_chunks {
        let chunk_in_dir = temp_dir_path.join(format!("chunk_in_{}", i));
        let chunk_out_dir = temp_dir_path.join(format!("chunk_out_{}", i));
        std::fs::create_dir_all(&chunk_in_dir).map_err(|e| e.to_string())?;
        std::fs::create_dir_all(&chunk_out_dir).map_err(|e| e.to_string())?;

        let start = i * chunk_size;
        let end = std::cmp::min(start + chunk_size, total_frames);
        
        for j in start..end {
            if j % 10 == 0 {
                let _ = app.emit("enhance-progress", format!("Prep: Active:Organizing Chunks ({}/{})...", j, total_frames));
            }
            let src = frame_files[j].path();
            let dest = chunk_in_dir.join(src.file_name().unwrap());
            std::fs::rename(src, dest).map_err(|e| e.to_string())?;
        }

        let mut cmd = StdCommand::new(engine_path.clone());
        cmd.arg("-i").arg(chunk_in_dir.to_str().unwrap())
           .arg("-o").arg(chunk_out_dir.to_str().unwrap())
           .arg("-s").arg(&ai_scale)
           .arg("-f").arg("jpg").arg("-n").arg(model_name)
           .arg("-t").arg(&final_tile).arg("-j").arg(thread_map);
        if hyper_detail { cmd.arg("-x"); }

        // Silence individual lane logs to prevent "multiple percentages" noise
        cmd.stdout(std::process::Stdio::null());
        cmd.stderr(std::process::Stdio::null());

        if cfg!(target_os = "windows") {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000);
        }
        
        let _ = app.emit("enhance-progress", format!("Prep: Active:Waking up GPU Lane {}...", i + 1));
        children.push(cmd.spawn().map_err(|e| format!("Failed to spawn Turbo Lane {}: {}", i, e))?);
    }

    let _ = app.emit("enhance-progress", "Prep: Active:Loading AI Neural Weights...");

    loop {
        let mut total_done = 0;
        for i in 0..num_chunks {
            let chunk_out_dir = temp_dir_path.join(format!("chunk_out_{}", i));
            if let Ok(paths) = std::fs::read_dir(chunk_out_dir) { total_done += paths.count(); }
        }
        
        if total_done == 0 {
            let _ = app.emit("enhance-progress", "Prep: Active:Waiting for first frame...");
        } else {
            let pct = (total_done as f64 / total_frames as f64) * 100.0;
            let _ = app.emit("enhance-progress", format!("{:.2}%", pct.min(99.9)));
        }
        if children.iter_mut().all(|c| c.try_wait().map(|s| s.is_some()).unwrap_or(true)) { break; }
        std::thread::sleep(std::time::Duration::from_millis(1500));
    }

    // 5. Consolidate and Stitch
    let _ = app.emit("enhance-progress", "Multiplexing newly enhanced frames...");
    for i in 0..num_chunks {
        let chunk_out_dir = temp_dir_path.join(format!("chunk_out_{}", i));
        for entry in std::fs::read_dir(chunk_out_dir).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            std::fs::rename(entry.path(), output_frames_dir.join(entry.file_name())).map_err(|e| e.to_string())?;
        }
    }

    let mut selected_encoder = "libx265";
    let mut extra_args = vec![];
    if auto_gpu {
        if cfg!(target_os = "macos") && is_encoder_supported(&app, &cache, "hevc_videotoolbox").await {
            selected_encoder = "hevc_videotoolbox";
            extra_args.extend(vec!["-q:v", "55"]);
        } else if cfg!(target_os = "windows") {
            if is_encoder_supported(&app, &cache, "hevc_nvenc").await {
                selected_encoder = "hevc_nvenc";
                extra_args.extend(vec!["-preset", "p4", "-cq", "24", "-b:v", "0"]);
            } else if is_encoder_supported(&app, &cache, "hevc_qsv").await {
                selected_encoder = "hevc_qsv";
                extra_args.extend(vec!["-global_quality", "24", "-preset", "faster"]);
            }
        }
    }
    if selected_encoder == "libx265" { extra_args.extend(vec!["-crf", "24", "-preset", "faster"]); }

    let out_pattern = output_frames_dir.join("frame_%08d.jpg");
    
    let mut stitch_vf = vec![];
    if ai_fps != "0" { stitch_vf.push(format!("minterpolate=fps={}:mi_mode=mci", ai_fps)); }
    if hyper_detail { stitch_vf.push("eq=contrast=1.1:saturation=1.2:gamma=0.95,unsharp=5:5:1.5:5:5:0.0".to_string()); }
    
    // Final command construction
    let mut final_args = vec![
        "-y".to_string(), "-hwaccel".to_string(), "auto".to_string(),
        "-r".to_string(), fps.to_string(), "-i".to_string(), out_pattern.to_str().unwrap().to_string()
    ];
    if has_audio { final_args.extend(vec!["-i".to_string(), audio_path.to_str().unwrap().to_string()]); }
    if !stitch_vf.is_empty() { 
        final_args.push("-vf".to_string()); 
        final_args.push(stitch_vf.join(",")); 
    }
    final_args.extend(vec!["-c:v".to_string(), selected_encoder.to_string(), "-pix_fmt".to_string(), "yuv420p".to_string(), "-tag:v".to_string(), "hvc1".to_string()]);
    for arg in extra_args { final_args.push(arg.to_string()); }
    if has_audio { final_args.extend(vec!["-c:a".to_string(), "aac".to_string(), "-b:a".to_string(), "192k".to_string(), "-shortest".to_string()]); }
    final_args.push("-movflags".to_string()); final_args.push("+faststart".to_string());
    final_args.push(output.clone());

    let stitch_status = app.shell().sidecar("ffmpeg").map_err(|e| e.to_string())?.args(final_args).output().await.map_err(|e| e.to_string())?;
    if !stitch_status.status.success() { return Err("Failed to stitch final video".to_string()); }

    let _ = std::fs::remove_dir_all(&temp_dir_path);
    let _ = app.emit("enhance-progress", "100.00%");
    Ok(())
}

#[tauri::command]
async fn compress_video(app: AppHandle, cache: State<'_, EncoderCache>, input: String, output: String, auto_gpu: bool) -> Result<(), String> {
    let input_path = Path::new(&input);
    if !input_path.exists() { return Err("Input file not found".to_string()); }

    let ext = Path::new(&output).extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
    let mut selected_encoder = "libx265";
    let mut selected_audio = "aac";
    let mut selected_preset = "faster"; 
    let mut extra_args: Vec<String> = vec![];

    match ext.as_str() {
        "mp4" | "mkv" | "mov" | "avi" | "flv" | "ts" | "m4v" | "wmv" => {
            extra_args.push("-pix_fmt".to_string()); 
            extra_args.push("yuv420p".to_string());
            extra_args.push("-tag:v".to_string()); extra_args.push("hvc1".to_string());

            if auto_gpu {
                if is_encoder_supported(&app, &cache, "hevc_nvenc").await {
                    selected_encoder = "hevc_nvenc";
                    selected_preset = "p4";
                    extra_args.push("-cq".to_string()); extra_args.push("24".to_string());
                    extra_args.push("-b:v".to_string()); extra_args.push("0".to_string());
                } else if is_encoder_supported(&app, &cache, "hevc_videotoolbox").await {
                    selected_encoder = "hevc_videotoolbox";
                    extra_args.push("-q:v".to_string()); extra_args.push("55".to_string());
                } else if is_encoder_supported(&app, &cache, "hevc_qsv").await {
                    selected_encoder = "hevc_qsv";
                    extra_args.push("-global_quality".to_string()); extra_args.push("24".to_string());
                    extra_args.push("-preset".to_string()); extra_args.push("faster".to_string());
                } else if is_encoder_supported(&app, &cache, "hevc_amf").await {
                    selected_encoder = "hevc_amf";
                    extra_args.push("-quality".to_string()); extra_args.push("quality".to_string());
                }
            } else {
                extra_args.push("-crf".to_string()); extra_args.push("24".to_string());
            }
        },
        "webm" => {
            selected_encoder = "libvpx-vp9";
            selected_audio = "libopus";
            extra_args.push("-b:v".to_string()); extra_args.push("0".to_string());
            extra_args.push("-crf".to_string()); extra_args.push("30".to_string());
        },
        "gif" => {
             let args = vec![
                 "-i".to_string(), input.clone(),
                 "-filter_complex".to_string(), "fps=15,scale=480:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse".to_string(),
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

    let mut args = vec![];
    args.push("-hwaccel".to_string());
    args.push("auto".to_string());
    args.push("-i".to_string());
    args.push(input.clone());
    args.push("-c:v".to_string());
    args.push(selected_encoder.to_string());

    if selected_encoder != "libvpx-vp9" && selected_encoder != "libtheora" && !selected_encoder.contains("videotoolbox") {
        args.push("-preset".to_string());
        args.push(selected_preset.to_string());
    }

    args.extend(extra_args);
    args.push("-c:a".to_string()); args.push(selected_audio.to_string());
    args.push("-y".to_string());
    args.push(output.clone());

    let sidecar_command = app.shell().sidecar("ffmpeg").map_err(|e| e.to_string())?.args(args);
    let (mut rx, _) = sidecar_command.spawn().map_err(|e| e.to_string())?;

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
                    if code != 0 { return Err(format!("Error (Code {}): {}", code, last_log_error)); }
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
    let mut args = vec![ "-hwaccel".to_string(), "auto".to_string(), "-i".to_string(), input.clone() ];
    if width != "0" && !width.is_empty() {
        let h = if height.is_empty() || height == "0" { "-1" } else { &height };
        args.push("-vf".to_string());
        args.push(format!("scale={}:{}", width, h));
    }
    
    let ext = Path::new(&output).extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
    match ext.as_str() {
        "jpg" | "jpeg" => {
            args.push("-q:v".to_string()); args.push("2".to_string());
        },
        "webp" => {
            args.push("-q:v".to_string()); args.push("75".to_string());
        },
        "png" => {
            args.push("-compression_level".to_string()); args.push("4".to_string());
        },
        _ => {}
    }
    
    args.push("-y".to_string());
    args.push(output.clone());
    let sidecar_command = app.shell().sidecar("ffmpeg").map_err(|e| e.to_string())?.args(args);
    let (mut rx, _) = sidecar_command.spawn().map_err(|e| e.to_string())?;
    while let Some(event) = rx.recv().await {
        if let CommandEvent::Stderr(line_bytes) = event {
            let line = String::from_utf8_lossy(&line_bytes);
            let _ = app.emit("ffmpeg-progress", line.to_string());
        }
    }
    Ok(())
}

#[tauri::command]
fn read_file_bytes(path: String) -> Result<Vec<u8>, String> {
    std::fs::read(path).map_err(|e| e.to_string())
}

#[tauri::command]
async fn compress_audio(app: AppHandle, input: String, output: String) -> Result<(), String> {
    let input_path = Path::new(&input);
    if !input_path.exists() { return Err("Input file not found".to_string()); }
    
    let ext = Path::new(&output).extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
    let mut args = vec![ "-hwaccel".to_string(), "auto".to_string(), "-i".to_string(), input.clone() ];

    match ext.as_str() {
        "mp3" => {
            args.extend(vec!["-c:a".to_string(), "libmp3lame".to_string(), "-q:a".to_string(), "4".to_string()]);
        },
        "aac" | "m4a" => {
            args.extend(vec!["-c:a".to_string(), "aac".to_string(), "-b:a".to_string(), "128k".to_string()]);
        },
        "ogg" => {
            args.extend(vec!["-c:a".to_string(), "libopus".to_string(), "-b:a".to_string(), "96k".to_string()]);
        },
        _ => {
            args.extend(vec!["-b:a".to_string(), "128k".to_string()]);
        }
    }
    
    args.push("-y".to_string());
    args.push(output.clone());

    let sidecar_command = app.shell().sidecar("ffmpeg").map_err(|e| e.to_string())?.args(args);
    let (mut rx, _) = sidecar_command.spawn().map_err(|e| e.to_string())?;
    
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
        .manage(EncoderCache(Mutex::new(HashMap::new())))
        .invoke_handler(tauri::generate_handler![
            compress_video, 
            compress_image, 
            compress_audio,
            stop_job, 
            enhance_image,
            enhance_video,
            read_file_bytes
        ])
        .on_window_event(|_window, event| {
            if let WindowEvent::Destroyed = event {
                #[cfg(target_os = "windows")]
                { 
                    let _ = StdCommand::new("cmd").args(["/C", "taskkill /F /T /IM ffmpeg*"]).spawn(); 
                    let _ = StdCommand::new("cmd").args(["/C", "taskkill /F /T /IM realesrgan*"]).spawn();
                }
                #[cfg(not(target_os = "windows"))]
                { 
                    let _ = StdCommand::new("pkill").arg("-9").arg("-f").arg("ffmpeg").spawn(); 
                    let _ = StdCommand::new("pkill").arg("-9").arg("-f").arg("realesrgan").spawn();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}