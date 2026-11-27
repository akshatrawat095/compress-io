mod ffmpeg_runtime;

use tauri::{AppHandle, Emitter, Manager, WindowEvent, State};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::process::Command as StdCommand;
use std::sync::Mutex;
use std::collections::HashMap;


// 🛡️ SECURITY: Restrict FFmpeg to safe local protocols only (blocks network, SSRF & protocol injection)
const SAFE_PROTOCOLS: &str = "file,crypto,data,pipe";

#[derive(Clone, Serialize)]
struct FfmpegTelemetry {
    job_id: String,
    current_secs: f64,
    total_secs: f64,
    speed: f64,
    fps: f64,
    pass: u8,
    total_passes: u8,
    overall_percent: f64,
    finalizing: bool,
}

#[derive(Clone, Serialize)]
struct HardwareCapabilities {
    tier: String,
    encoder: String,
    label: String,
    can_dual_engine: bool,
}

#[derive(Clone, Debug)]
struct MediaProbe {
    duration: f64,
    width: u32,
    height: u32,
    bitrate_kbps: f64,
    has_audio: bool,
}

/// Computes optimal (worker_threads, frame_threads) tailored to system pacing & 4K memory footprint.
fn get_cpu_threads_for_mode(perf_mode: &str, is_4k: bool) -> (usize, usize) {
    let cores = std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(4);

    match perf_mode {
        "eco" => {
            // Keep ~70-75% cores completely idle and limit to 1 frame-thread for zero lag/thermal spike
            let workers = (cores / 4).max(1).min(4);
            (workers, 1)
        }
        "turbo" => {
            let workers = (cores.saturating_sub(1)).clamp(1, 12);
            let frames = if is_4k { 2.min(workers) } else { 3.min(workers) };
            (workers, frames)
        }
        _ => {
            // Balanced sweet spot (~50% logical cores on high-core CPUs avoids SMT/cache thrashing)
            let workers = match cores {
                0..=2 => 1,
                3..=4 => 3,
                5..=8 => cores - 2,
                9..=16 => (cores / 2).max(6),
                _ => (cores / 2).min(12),
            };
            let frames = if is_4k || workers < 8 { 2.min(workers) } else { 3 };
            (workers, frames)
        }
    }
}

/// Applies OS CPU priority, Windows 11 EcoQoS (E-core routing in eco), and Low Disk I/O Priority.
fn apply_process_profile(pid: u32, perf_mode: &str) {
    #[cfg(target_os = "windows")]
    {
        #[repr(C)]
        struct ProcessPowerThrottlingState {
            version: u32,
            control_mask: u32,
            state_mask: u32,
        }

        const PROCESS_SET_INFORMATION: u32 = 0x0200;
        const BELOW_NORMAL_PRIORITY_CLASS: u32 = 0x00004000;
        const IDLE_PRIORITY_CLASS: u32 = 0x00000040;
        const PROCESS_POWER_THROTTLING: i32 = 4;
        const PROCESS_POWER_THROTTLING_CURRENT_VERSION: u32 = 1;
        const PROCESS_POWER_THROTTLING_EXECUTION_SPEED: u32 = 0x1;
        const PROCESS_IO_PRIORITY: i32 = 33;

        extern "system" {
            fn OpenProcess(dwDesiredAccess: u32, bInheritHandle: i32, dwProcessId: u32) -> *mut std::ffi::c_void;
            fn SetPriorityClass(hProcess: *mut std::ffi::c_void, dwPriorityClass: u32) -> i32;
            fn CloseHandle(hObject: *mut std::ffi::c_void) -> i32;
            fn GetModuleHandleA(lpModuleName: *const u8) -> *mut std::ffi::c_void;
            fn GetProcAddress(hModule: *mut std::ffi::c_void, lpProcName: *const u8) -> *mut std::ffi::c_void;
        }

        type SetProcessInformationFn = unsafe extern "system" fn(
            *mut std::ffi::c_void,
            i32,
            *const std::ffi::c_void,
            u32,
        ) -> i32;
        type NtSetInformationProcessFn = unsafe extern "system" fn(
            *mut std::ffi::c_void,
            i32,
            *const std::ffi::c_void,
            u32,
        ) -> i32;

        let priority_class = match perf_mode {
            "eco" => IDLE_PRIORITY_CLASS,
            _ => BELOW_NORMAL_PRIORITY_CLASS,
        };

        unsafe {
            let handle = OpenProcess(PROCESS_SET_INFORMATION, 0, pid);
            if !handle.is_null() {
                SetPriorityClass(handle, priority_class);

                let k32 = GetModuleHandleA(b"kernel32.dll\0".as_ptr());
                if !k32.is_null() {
                    let proc_ptr = GetProcAddress(k32, b"SetProcessInformation\0".as_ptr());
                    if !proc_ptr.is_null() {
                        let set_proc_info: SetProcessInformationFn = std::mem::transmute(proc_ptr);
                        let enable_eco = perf_mode == "eco";
                        let state = ProcessPowerThrottlingState {
                            version: PROCESS_POWER_THROTTLING_CURRENT_VERSION,
                            control_mask: PROCESS_POWER_THROTTLING_EXECUTION_SPEED,
                            state_mask: if enable_eco { PROCESS_POWER_THROTTLING_EXECUTION_SPEED } else { 0 },
                        };
                        set_proc_info(
                            handle,
                            PROCESS_POWER_THROTTLING,
                            &state as *const _ as *const std::ffi::c_void,
                            std::mem::size_of::<ProcessPowerThrottlingState>() as u32,
                        );
                    }
                }

                if perf_mode != "turbo" {
                    let ntdll = GetModuleHandleA(b"ntdll.dll\0".as_ptr());
                    if !ntdll.is_null() {
                        let nt_ptr = GetProcAddress(ntdll, b"NtSetInformationProcess\0".as_ptr());
                        if !nt_ptr.is_null() {
                            let nt_set_info: NtSetInformationProcessFn = std::mem::transmute(nt_ptr);
                            let io_prio: u32 = if perf_mode == "eco" { 0 } else { 1 };
                            nt_set_info(
                                handle,
                                PROCESS_IO_PRIORITY,
                                &io_prio as *const _ as *const std::ffi::c_void,
                                std::mem::size_of::<u32>() as u32,
                            );
                        }
                    }
                }

                CloseHandle(handle);
            }
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        let nice_val = match perf_mode {
            "eco" => "15",
            "turbo" => "5",
            _ => "10",
        };
        let pid_str = pid.to_string();
        let _ = StdCommand::new("renice")
            .args(["-n", nice_val, "-p", &pid_str])
            .output();
        #[cfg(target_os = "linux")]
        if perf_mode != "turbo" {
            let io_prio = if perf_mode == "eco" { "7" } else { "6" };
            let _ = StdCommand::new("ionice")
                .args(["-c", "2", "-n", io_prio, "-p", &pid_str])
                .output();
        }
    }
}

/// Parses FFmpeg's `Duration: HH:MM:SS.xx` header into fractional seconds without panicking.
fn parse_ffmpeg_duration(text: &str) -> Option<f64> {
    let idx = text.find("Duration: ")?;
    let after = &text[idx + 10..];
    let end = after.find(',').unwrap_or_else(|| after.len().min(16));
    let duration_str = after[..end].trim();
    if duration_str.eq_ignore_ascii_case("N/A") {
        return None;
    }
    let parts: Vec<&str> = duration_str.split(':').collect();
    if parts.len() != 3 {
        return None;
    }
    let h: f64 = parts[0].trim().parse().ok()?;
    let m: f64 = parts[1].trim().parse().ok()?;
    let s: f64 = parts[2].trim().parse().ok()?;
    let total = h * 3600.0 + m * 60.0 + s;
    if total > 0.0 { Some(total) } else { None }
}

/// Extracts resolution, bitrate, duration, and audio presence from FFmpeg probe stderr.
fn parse_media_probe(stderr: &str) -> MediaProbe {
    let duration = parse_ffmpeg_duration(stderr).unwrap_or(0.0);
    let has_audio = stderr.contains("Audio:");

    let mut bitrate_kbps = 0.0;
    if let Some(br_idx) = stderr.find("bitrate: ") {
        let after = &stderr[br_idx + 9..];
        if let Some(unit_idx) = after.find(" kb/s") {
            bitrate_kbps = after[..unit_idx].trim().parse::<f64>().unwrap_or(0.0);
        }
    }

    let mut width = 0_u32;
    let mut height = 0_u32;
    for line in stderr.lines() {
        if line.contains("Video:") {
            for token in line.split(|c: char| c == ',' || c == ' ') {
                let t = token.trim();
                if let Some((w_str, h_str)) = t.split_once('x') {
                    if let (Ok(w), Ok(h)) = (w_str.parse::<u32>(), h_str.parse::<u32>()) {
                        if w >= 64 && h >= 64 {
                            width = w;
                            height = h;
                            break;
                        }
                    }
                }
            }
            if width > 0 {
                break;
            }
        }
    }

    MediaProbe {
        duration,
        width,
        height,
        bitrate_kbps,
        has_audio,
    }
}

/// Executes FFmpeg with OS pacing profile and streams structured 250ms telemetry.
async fn run_ffmpeg_with_telemetry(
    app: &AppHandle,
    args: Vec<String>,
    pass: u8,
    total_passes: u8,
    known_duration: Option<f64>,
    work_dir: Option<&Path>,
    perf_mode: &str,
    job_id: &str,
    error_prefix: &str,
) -> Result<(), String> {
    let mut full_args = vec![
        "-nostats".to_string(),
        "-stats_period".to_string(),
        "0.25".to_string(),
        "-progress".to_string(),
        "pipe:1".to_string(),
    ];
    full_args.extend(args);

    let ffmpeg_path = ffmpeg_runtime::resolve_ffmpeg_path(app).await?;
    let mut cmd = ffmpeg_runtime::build_ffmpeg_tokio_command(&ffmpeg_path, &full_args, work_dir);
    cmd.stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    let mut child = cmd.spawn().map_err(|e| e.to_string())?;
    if let Some(pid) = child.id() {
        apply_process_profile(pid, perf_mode);
    }

    let (tx, mut rx) = tokio::sync::mpsc::channel::<(bool, Vec<u8>)>(128);
    if let Some(stdout) = child.stdout.take() {
        let tx_out = tx.clone();
        tokio::spawn(ffmpeg_runtime::stream_pipe_lines(stdout, tx_out, false));
    }
    if let Some(stderr) = child.stderr.take() {
        let tx_err = tx.clone();
        tokio::spawn(ffmpeg_runtime::stream_pipe_lines(stderr, tx_err, true));
    }
    drop(tx);

    let mut total_secs = known_duration.unwrap_or(0.0);
    let mut last_current_secs = 0.0_f64;
    let mut block_time_secs: Option<f64> = None;
    let mut block_speed = 0.0_f64;
    let mut block_fps = 0.0_f64;
    let mut last_log_error = String::from("Unknown FFmpeg Error");

    while let Some((is_stderr, line_bytes)) = rx.recv().await {
        if is_stderr {
            let line = String::from_utf8_lossy(&line_bytes);
            let trimmed = line.trim();
            if !trimmed.is_empty() {
                last_log_error = trimmed.to_string();
            }
            if total_secs <= 0.0 {
                if let Some(d) = parse_ffmpeg_duration(&line) {
                    total_secs = d;
                }
            }
        } else {
            let text = String::from_utf8_lossy(&line_bytes);
            for raw in text.lines() {
                let s = raw.trim();
                if let Some(val) = s.strip_prefix("out_time_us=") {
                    if let Ok(us) = val.parse::<f64>() {
                        if us >= 0.0 {
                            block_time_secs = Some(us / 1_000_000.0);
                        }
                    }
                } else if let Some(val) = s.strip_prefix("speed=") {
                    if let Ok(sp) = val.trim_end_matches('x').trim().parse::<f64>() {
                        if sp >= 0.0 {
                            block_speed = sp;
                        }
                    }
                } else if let Some(val) = s.strip_prefix("fps=") {
                    if let Ok(f) = val.trim().parse::<f64>() {
                        if f >= 0.0 {
                            block_fps = f;
                        }
                    }
                } else if let Some(status) = s.strip_prefix("progress=") {
                    if total_secs > 0.0 {
                        let is_end = status == "end";
                        let current = if is_end {
                            block_time_secs.unwrap_or(total_secs)
                        } else {
                            block_time_secs.unwrap_or(last_current_secs)
                        }
                        .clamp(0.0, total_secs);
                        last_current_secs = current;

                        let ratio = (current / total_secs).clamp(0.0, 1.0);
                        let overall_percent = if total_passes == 2 {
                            if pass == 1 {
                                ratio * 45.0
                            } else {
                                45.0 + ratio * 55.0
                            }
                        } else {
                            ratio * 100.0
                        };

                        let _ = app.emit(
                            "ffmpeg-telemetry",
                            FfmpegTelemetry {
                                job_id: job_id.to_string(),
                                current_secs: current,
                                total_secs,
                                speed: block_speed,
                                fps: block_fps,
                                pass,
                                total_passes,
                                overall_percent,
                                finalizing: is_end && pass == total_passes,
                            },
                        );
                    }
                    block_time_secs = None;
                }
            }
        }
    }

    let status = child.wait().await.map_err(|e| e.to_string())?;
    if !status.success() {
        let code = status.code().unwrap_or(-1);
        return Err(format!("{} (Code {}): {}", error_prefix, code, last_log_error));
    }
    Ok(())
}

fn absolutize_path(p: &str) -> String {
    let path = Path::new(p);
    if path.is_absolute() {
        p.to_string()
    } else if let Ok(cwd) = std::env::current_dir() {
        cwd.join(path).to_string_lossy().to_string()
    } else {
        p.to_string()
    }
}

struct EncoderCache(Mutex<HashMap<String, bool>>);

struct StartupFilesState(Mutex<Vec<String>>);

#[tauri::command]
fn take_startup_files(state: State<'_, StartupFilesState>) -> Vec<String> {
    let mut guard = state.0.lock().unwrap();
    std::mem::take(&mut *guard)
}

// --- DIAGNOSTIC HELPER: Checks and PRINTS GPU status ---
async fn is_encoder_supported(app: &AppHandle, cache: &State<'_, EncoderCache>, encoder: &str) -> bool {
    {
        let cache_map = cache.0.lock().unwrap();
        if let Some(&supported) = cache_map.get(encoder) {
            return supported;
        }
    }

    if encoder == "hevc_vaapi" && !Path::new("/dev/dri/renderD128").exists() {
        let mut cache_map = cache.0.lock().unwrap();
        cache_map.insert(encoder.to_string(), false);
        return false;
    }

    println!("🔍 DIAGNOSTIC: Checking support for encoder: {}", encoder);

    let args: Vec<&str> = if encoder == "hevc_vaapi" {
        vec![
            "-vaapi_device", "/dev/dri/renderD128",
            "-f", "lavfi", "-i", "color=s=1280x720:d=0.1",
            "-vf", "format=nv12,hwupload",
            "-c:v", "hevc_vaapi",
            "-f", "null", "-"
        ]
    } else if encoder == "hevc_videotoolbox" {
        vec![
            "-f", "lavfi", "-i", "color=s=1280x720:d=0.1",
            "-c:v", "hevc_videotoolbox", "-q:v", "58",
            "-f", "null", "-"
        ]
    } else {
        vec![
            "-f", "lavfi", "-i", "color=s=1280x720:d=0.1",
            "-c:v", encoder,
            "-f", "null", "-"
        ]
    };

    let str_args: Vec<String> = args.into_iter().map(|s| s.to_string()).collect();
    let supported = match ffmpeg_runtime::run_ffmpeg_output(app, &str_args).await {
        Ok(o) => o.status.success(),
        Err(e) => {
            println!("❌ DIAGNOSTIC: FFmpeg runtime unavailable for {}: {}", encoder, e);
            false
        }
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

async fn select_gpu_hevc_encoder(app: &AppHandle, cache: &State<'_, EncoderCache>) -> Option<&'static str> {
    if cfg!(target_os = "macos") {
        if is_encoder_supported(app, cache, "hevc_videotoolbox").await {
            return Some("hevc_videotoolbox");
        }
        return None;
    }

    if is_encoder_supported(app, cache, "hevc_nvenc").await {
        return Some("hevc_nvenc");
    }
    if is_encoder_supported(app, cache, "hevc_qsv").await {
        return Some("hevc_qsv");
    }
    if cfg!(target_os = "windows") && is_encoder_supported(app, cache, "hevc_amf").await {
        return Some("hevc_amf");
    }
    if cfg!(target_os = "linux") && is_encoder_supported(app, cache, "hevc_vaapi").await {
        return Some("hevc_vaapi");
    }
    None
}

#[tauri::command]
async fn detect_hardware_tier(app: AppHandle, cache: State<'_, EncoderCache>) -> Result<HardwareCapabilities, String> {
    if let Some(enc) = select_gpu_hevc_encoder(&app, &cache).await {
        let (tier, label, can_dual_engine) = match enc {
            "hevc_nvenc" => ("dgpu", "NVIDIA NVENC", true),
            "hevc_qsv" => ("igpu", "Intel QuickSync", false),
            "hevc_amf" => ("igpu", "AMD VCN", false),
            "hevc_videotoolbox" => ("igpu", "Apple VideoToolbox", false),
            "hevc_vaapi" => ("igpu", "Linux VAAPI", false),
            _ => ("cpu", "Tuned CPU", false),
        };
        return Ok(HardwareCapabilities {
            tier: tier.to_string(),
            encoder: enc.to_string(),
            label: label.to_string(),
            can_dual_engine,
        });
    }

    Ok(HardwareCapabilities {
        tier: "cpu".to_string(),
        encoder: "libx265".to_string(),
        label: "Tuned CPU".to_string(),
        can_dual_engine: false,
    })
}

#[tauri::command]
fn stop_job() {
    println!("🛑 FORCE STOP: Killing all media processes...");
    #[cfg(target_os = "windows")]
    { 
        use std::os::windows::process::CommandExt;
        let _ = StdCommand::new("cmd").args(["/C", "taskkill /F /T /IM ffmpeg*"]).creation_flags(0x08000000).spawn(); 
        let _ = StdCommand::new("cmd").args(["/C", "taskkill /F /T /IM realesrgan*"]).creation_flags(0x08000000).spawn();
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
    _face_restore: bool, 
    hyper_detail: bool,
    tile_size: String,
) -> Result<(), String> {
    println!("✨ DIAGNOSTIC: Enhance Image Function Called");

    let resource_dir = app.path().resource_dir().map_err(|e| e.to_string())?;
    #[cfg(target_os = "windows")]
    let engine_path = resource_dir.join("binaries").join("ai_engine").join("realesrgan-ncnn-vulkan.exe");
    #[cfg(not(target_os = "windows"))]
    let engine_path = resource_dir.join("binaries").join("ai_engine").join("realesrgan-ncnn-vulkan");

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
        command.creation_flags(0x08000000 | 0x00004000);
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
    let probe_args = vec![
        "-hwaccel".to_string(), "auto".to_string(),
        "-protocol_whitelist".to_string(), SAFE_PROTOCOLS.to_string(),
        "-i".to_string(), input.clone(),
    ];
    let probe_out = ffmpeg_runtime::run_ffmpeg_output(&app, &probe_args).await?;
    let probe_str = String::from_utf8_lossy(&probe_out.stderr);
    
    let mut fps: f64 = 30.0;
    if let Some(fps_idx) = probe_str.find(" fps") {
        let snippet = &probe_str[..fps_idx];
        if let Some(comma_idx) = snippet.rfind(',') {
            fps = snippet[comma_idx+1..].trim().parse::<f64>().unwrap_or(30.0);
        }
    }

    let mut total_frames: u64 = 0;
    if let Some(total_seconds) = parse_ffmpeg_duration(&probe_str) {
        total_frames = (total_seconds * fps).round() as u64;
    }
    
    if total_frames > 0 {
        let _ = app.emit("enhance-progress", format!("Prep: Count:{}", total_frames));
    }

    // 2. Extract Audio
    let _ = app.emit("enhance-progress", "Separating audio track...");
    let audio_args = vec![
        "-y".to_string(), "-hwaccel".to_string(), "auto".to_string(),
        "-protocol_whitelist".to_string(), SAFE_PROTOCOLS.to_string(),
        "-i".to_string(), input.clone(), "-vn".to_string(),
        "-c:a".to_string(), "copy".to_string(), audio_path.to_str().unwrap().to_string(),
    ];
    let audio_status = ffmpeg_runtime::run_ffmpeg_output(&app, &audio_args).await?;
    let has_audio = audio_path.exists() && audio_status.status.success();

    // 3. Extract Frames with Live Progress
    let _ = app.emit("enhance-progress", "Extracting frames... (Hold tight)");
    let frames_pattern = input_frames_dir.join("frame_%08d.jpg");
    
    let mut vf_chain = "scale=-2:'min(1080,ih)'".to_string();
    if stabilize {
        let trf_path = temp_dir_path.join("transform.trf").to_str().unwrap().replace("\\", "/");
        let stab_args = vec![
            "-y".to_string(), "-hwaccel".to_string(), "auto".to_string(),
            "-protocol_whitelist".to_string(), SAFE_PROTOCOLS.to_string(),
            "-i".to_string(), input.clone(),
            "-vf".to_string(), format!("vidstabdetect=stepsize=32:shakiness=10:accuracy=10:result={}", trf_path),
            "-f".to_string(), "null".to_string(), "-".to_string(),
        ];
        let _ = ffmpeg_runtime::run_ffmpeg_output(&app, &stab_args).await;
        vf_chain = format!("vidstabtransform=input={}:optzoom=1:zoomspeed=0.2:smoothing=10,{}", trf_path, vf_chain);
    }
    if denoise {
        vf_chain = format!("hqdn3d=4.0:3.0:6.0:4.5,{}", vf_chain);
    }

    let (worker_threads, frame_threads) = get_cpu_threads_for_mode("balanced", false);
    let ffmpeg_path = ffmpeg_runtime::resolve_ffmpeg_path(&app).await?;
    let frame_args = vec![
        "-y".to_string(), "-hwaccel".to_string(), "auto".to_string(),
        "-threads".to_string(), worker_threads.to_string(),
        "-protocol_whitelist".to_string(), SAFE_PROTOCOLS.to_string(),
        "-i".to_string(), input.clone(),
        "-vf".to_string(), vf_chain,
        "-progress".to_string(), "pipe:1".to_string(),
        "-vsync".to_string(), "0".to_string(),
        frames_pattern.to_str().unwrap().to_string(),
    ];
    let mut frames_cmd = ffmpeg_runtime::build_ffmpeg_tokio_command(&ffmpeg_path, &frame_args, None);
    frames_cmd.stdout(std::process::Stdio::piped()).stderr(std::process::Stdio::null());
    let mut frames_child = frames_cmd.spawn().map_err(|e| e.to_string())?;
    if let Some(pid) = frames_child.id() {
        apply_process_profile(pid, "balanced");
    }

    let (tx, mut rx) = tokio::sync::mpsc::channel::<(bool, Vec<u8>)>(64);
    if let Some(stdout) = frames_child.stdout.take() {
        tokio::spawn(ffmpeg_runtime::stream_pipe_lines(stdout, tx, false));
    } else {
        drop(tx);
    }
    while let Some((_, line_bytes)) = rx.recv().await {
        let line = String::from_utf8_lossy(&line_bytes);
        if line.contains("frame=") {
            let frame_str = line.split("frame=").last().unwrap_or("").trim().split(' ').next().unwrap_or("");
            let _ = app.emit("enhance-progress", format!("Prep: Processing:{}", frame_str));
        }
    }
    let _ = frames_child.wait().await;

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
    #[cfg(target_os = "windows")]
    let engine_path = resource_dir.join("binaries").join("ai_engine").join("realesrgan-ncnn-vulkan.exe");
    #[cfg(not(target_os = "windows"))]
    let engine_path = resource_dir.join("binaries").join("ai_engine").join("realesrgan-ncnn-vulkan");

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

        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000 | 0x00004000);
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
    let mut extra_args: Vec<String> = vec![];
    if auto_gpu {
        if cfg!(target_os = "macos") && is_encoder_supported(&app, &cache, "hevc_videotoolbox").await {
            selected_encoder = "hevc_videotoolbox";
            extra_args.extend(["-q:v", "55"].iter().map(|s| s.to_string()));
        } else if is_encoder_supported(&app, &cache, "hevc_nvenc").await {
            selected_encoder = "hevc_nvenc";
            extra_args.extend(["-preset", "p4", "-cq", "24", "-b:v", "0"].iter().map(|s| s.to_string()));
        } else if cfg!(target_os = "windows") && is_encoder_supported(&app, &cache, "hevc_qsv").await {
            selected_encoder = "hevc_qsv";
            extra_args.extend(["-global_quality", "24", "-preset", "faster"].iter().map(|s| s.to_string()));
        }
    }
    if selected_encoder == "libx265" {
        extra_args.extend(vec![
            "-crf".to_string(), "24".to_string(),
            "-preset".to_string(), "faster".to_string(),
            "-x265-params".to_string(), format!("no-sao=1:pools={}:frame-threads={}", worker_threads, frame_threads),
        ]);
    }

    let out_pattern = output_frames_dir.join("frame_%08d.jpg");
    
    let mut stitch_vf = vec![];
    if ai_fps != "0" { stitch_vf.push(format!("minterpolate=fps={}:mi_mode=mci", ai_fps)); }
    if hyper_detail { stitch_vf.push("eq=contrast=1.1:saturation=1.2:gamma=0.95,unsharp=5:5:1.5:5:5:0.0".to_string()); }
    
    // Final command construction
    let mut final_args = vec![
        "-y".to_string(), "-hwaccel".to_string(), "auto".to_string(),
        "-threads".to_string(), worker_threads.to_string(),
        "-r".to_string(), fps.to_string(), "-i".to_string(), out_pattern.to_str().unwrap().to_string()
    ];
    if has_audio { final_args.extend(vec!["-i".to_string(), audio_path.to_str().unwrap().to_string()]); }
    if !stitch_vf.is_empty() { 
        final_args.push("-vf".to_string()); 
        final_args.push(stitch_vf.join(",")); 
    }
    final_args.extend(vec!["-c:v".to_string(), selected_encoder.to_string(), "-pix_fmt".to_string(), "yuv420p".to_string(), "-tag:v".to_string(), "hvc1".to_string()]);
    final_args.extend(extra_args);
    if has_audio { final_args.extend(vec!["-c:a".to_string(), "aac".to_string(), "-b:a".to_string(), "192k".to_string(), "-shortest".to_string()]); }
    final_args.push("-movflags".to_string()); final_args.push("+faststart".to_string());
    final_args.push(output.clone());

    run_ffmpeg_with_telemetry(&app, final_args, 1, 1, None, None, "balanced", "enhance", "Failed to stitch final video").await?;

    let _ = std::fs::remove_dir_all(&temp_dir_path);
    let _ = app.emit("enhance-progress", "100.00%");
    Ok(())
}

async fn probe_media_internal(app: &AppHandle, input: &str) -> Result<MediaProbe, String> {
    let args = vec![
        "-protocol_whitelist".to_string(),
        SAFE_PROTOCOLS.to_string(),
        "-i".to_string(),
        input.to_string(),
    ];
    let output = ffmpeg_runtime::run_ffmpeg_output(app, &args).await?;

    let stderr = String::from_utf8_lossy(&output.stderr);
    Ok(parse_media_probe(&stderr))
}

/// Automatically chooses quality profile from probed resolution and bitrate unless explicitly overridden.
fn select_auto_quality_profile(probe: &MediaProbe, explicit_quality: Option<&str>) -> &'static str {
    match explicit_quality {
        Some("high") => "high",
        Some("balanced") => "balanced",
        Some("compact") => "compact",
        _ => {
            let is_4k = probe.height >= 2160 || probe.width >= 3840;
            if probe.bitrate_kbps >= 12000.0 || (is_4k && probe.bitrate_kbps <= 0.0) {
                "high"
            } else {
                "balanced"
            }
        }
    }
}

#[tauri::command]
async fn compress_video(
    app: AppHandle,
    cache: State<'_, EncoderCache>,
    input: String,
    output: String,
    auto_gpu: bool,
    quality: Option<String>,
    perf_mode: Option<String>,
    job_id: Option<String>,
) -> Result<(), String> {
    let input_path = Path::new(&input);
    if !input_path.exists() { return Err("Input file not found".to_string()); }

    let p_mode = perf_mode.as_deref().unwrap_or("balanced");
    let jid = job_id.as_deref().unwrap_or("single");

    let probe = probe_media_internal(&app, &input).await.unwrap_or(MediaProbe {
        duration: 0.0,
        width: 0,
        height: 0,
        bitrate_kbps: 0.0,
        has_audio: true,
    });
    let q_mode = select_auto_quality_profile(&probe, quality.as_deref());
    let is_4k = probe.height >= 2160 || probe.width >= 3840;
    let known_duration = if probe.duration > 0.0 { Some(probe.duration) } else { None };

    let (worker_threads, frame_threads) = get_cpu_threads_for_mode(p_mode, is_4k);
    let ext = Path::new(&output).extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();

    let (crf_val, nvenc_cq, qsv_q, amf_q, vt_q, vp9_crf, base_audio_kbps) = match q_mode {
        "high" if is_4k => ("21", "25", "22", "22", "62", "26", "192k"),
        "high" => ("19", "23", "20", "20", "68", "24", "192k"),
        "compact" => ("29", "33", "29", "29", "45", "36", "96k"),
        _ => ("24", "28", "24", "24", "58", "30", "128k"),
    };
    let audio_kbps = if probe.bitrate_kbps > 0.0 && probe.bitrate_kbps < 1000.0 {
        "96k"
    } else {
        base_audio_kbps
    };

    if ext == "gif" {
        let gif_filter = match q_mode {
            "high" => "fps=24,scale='min(720,iw)':-1:flags=lanczos,split[s0][s1];[s0]palettegen=stats_mode=diff[p];[s1][p]paletteuse=dither=bayer",
            "compact" => "fps=12,scale='min(360,iw)':-1:flags=lanczos,split[s0][s1];[s0]palettegen=stats_mode=diff[p];[s1][p]paletteuse=dither=bayer",
            _ => "fps=15,scale='min(480,iw)':-1:flags=lanczos,split[s0][s1];[s0]palettegen=stats_mode=diff[p];[s1][p]paletteuse=dither=bayer",
        };
        let args = vec![
            "-threads".to_string(), worker_threads.to_string(),
            "-protocol_whitelist".to_string(), SAFE_PROTOCOLS.to_string(),
            "-i".to_string(), input.clone(),
            "-filter_complex".to_string(), gif_filter.to_string(),
            "-y".to_string(), output.clone(),
        ];
        return run_ffmpeg_with_telemetry(&app, args, 1, 1, known_duration, None, p_mode, jid, "GIF Error").await;
    }

    let mut selected_encoder = "libx265";
    let mut selected_audio = "aac";
    let mut extra_args: Vec<String> = vec![];
    let mut pre_input_args: Vec<String> = vec!["-hwaccel".to_string(), "auto".to_string()];

    match ext.as_str() {
        "mp4" | "mkv" | "mov" | "avi" | "flv" | "ts" | "m4v" | "wmv" => {
            if auto_gpu {
                if let Some(gpu_enc) = select_gpu_hevc_encoder(&app, &cache).await {
                    selected_encoder = gpu_enc;
                }
            }

            let pix_fmt = if matches!(selected_encoder, "hevc_qsv" | "hevc_vaapi") {
                "nv12"
            } else {
                "yuv420p"
            };

            if selected_encoder == "hevc_vaapi" {
                pre_input_args = vec!["-vaapi_device".to_string(), "/dev/dri/renderD128".to_string()];
                extra_args.extend(["-vf", "format=nv12,hwupload", "-qp", qsv_q, "-tag:v", "hvc1"].iter().map(|s| s.to_string()));
            } else {
                extra_args.extend(["-pix_fmt", pix_fmt, "-tag:v", "hvc1"].iter().map(|s| s.to_string()));
            }

            let low_bitrate_max_k = if selected_encoder != "libx265"
                && q_mode != "high"
                && probe.bitrate_kbps > 0.0
                && probe.bitrate_kbps < 3500.0
            {
                let factor = if q_mode == "compact" { 0.75 } else { 0.90 };
                Some((probe.bitrate_kbps * factor).max(80.0).floor())
            } else {
                None
            };

            match selected_encoder {
                "hevc_nvenc" => {
                    let nv_preset = if q_mode == "high" { "p5" } else { "p4" };
                    extra_args.extend([
                        "-preset", nv_preset, "-tune", "hq", "-rc", "vbr",
                        "-cq", nvenc_cq, "-b:v", "0", "-spatial-aq", "1",
                    ].iter().map(|s| s.to_string()));
                }
                "hevc_videotoolbox" => {
                    if let Some(max_k) = low_bitrate_max_k {
                        extra_args.extend(vec![
                            "-b:v".to_string(), format!("{}k", max_k),
                            "-maxrate".to_string(), format!("{}k", max_k),
                        ]);
                    } else {
                        extra_args.extend(["-q:v", vt_q].iter().map(|s| s.to_string()));
                    }
                }
                "hevc_qsv" => {
                    let qsv_preset = if q_mode == "high" { "medium" } else { "faster" };
                    extra_args.extend(["-preset", qsv_preset, "-global_quality", qsv_q].iter().map(|s| s.to_string()));
                    if q_mode != "compact" {
                        extra_args.extend(["-look_ahead_depth", "20"].iter().map(|s| s.to_string()));
                    }
                }
                "hevc_amf" => {
                    let amf_quality = if q_mode == "compact" { "balanced" } else { "quality" };
                    extra_args.extend([
                        "-quality", amf_quality, "-rc", "qvbr", "-qvbr_quality_level", amf_q,
                    ].iter().map(|s| s.to_string()));
                }
                "libx265" => {
                    let x265_preset = if q_mode == "high" && !is_4k { "fast" } else { "faster" };
                    extra_args.extend(vec![
                        "-preset".to_string(), x265_preset.to_string(),
                        "-crf".to_string(), crf_val.to_string(),
                        "-x265-params".to_string(), format!("no-sao=1:pools={}:frame-threads={}", worker_threads, frame_threads),
                    ]);
                }
                _ => {}
            }

            // Guard against bloating already small / low-bitrate inputs during GPU VBR encodes
            if selected_encoder != "hevc_videotoolbox" {
                if let Some(max_k) = low_bitrate_max_k {
                    extra_args.extend(vec![
                        "-maxrate".to_string(), format!("{}k", max_k),
                        "-bufsize".to_string(), format!("{}k", max_k * 2.0),
                    ]);
                }
            }
        },
        "webm" => {
            selected_encoder = "libvpx-vp9";
            selected_audio = "libopus";
            let cpu_used = if q_mode == "high" { "2" } else { "4" };
            extra_args.extend([
                "-b:v", "0", "-crf", vp9_crf, "-row-mt", "1", "-cpu-used", cpu_used,
            ].iter().map(|s| s.to_string()));
        },
        "ogv" => {
            selected_encoder = "libtheora";
            selected_audio = "libvorbis";
            let q_theora = if q_mode == "high" { "8" } else if q_mode == "compact" { "4" } else { "6" };
            extra_args.extend(["-q:v", q_theora].iter().map(|s| s.to_string()));
        },
        _ => {}
    }

    let mut args = pre_input_args;
    args.extend(vec![
        "-threads".to_string(), worker_threads.to_string(),
        "-protocol_whitelist".to_string(), SAFE_PROTOCOLS.to_string(),
        "-i".to_string(), input.clone(),
        "-c:v".to_string(), selected_encoder.to_string(),
    ]);
    args.extend(extra_args);

    if probe.has_audio {
        args.extend(vec![
            "-c:a".to_string(), selected_audio.to_string(),
            "-b:a".to_string(), audio_kbps.to_string(),
        ]);
    } else {
        args.push("-an".to_string());
    }

    if matches!(ext.as_str(), "mp4" | "mov" | "m4v") {
        args.extend(vec!["-movflags".to_string(), "+faststart".to_string()]);
    }
    args.push("-y".to_string());
    args.push(output.clone());

    run_ffmpeg_with_telemetry(&app, args, 1, 1, known_duration, None, p_mode, jid, "Error").await
}

#[tauri::command]
async fn compress_image(
    app: AppHandle,
    input: String,
    output: String,
    width: String,
    height: String,
    quality: Option<String>,
    perf_mode: Option<String>,
) -> Result<(), String> {
    let input_path = Path::new(&input);
    if !input_path.exists() { return Err("Input file not found".to_string()); }
    let q_mode = quality.as_deref().unwrap_or("balanced");
    let p_mode = perf_mode.as_deref().unwrap_or("balanced");
    let (worker_threads, _) = get_cpu_threads_for_mode(p_mode, false);

    let mut args = vec![
        "-threads".to_string(), worker_threads.to_string(),
        "-protocol_whitelist".to_string(), SAFE_PROTOCOLS.to_string(),
        "-i".to_string(), input.clone(),
    ];
    if width != "0" && !width.is_empty() {
        let h = if height.is_empty() || height == "0" { "-1" } else { &height };
        args.push("-vf".to_string());
        args.push(format!("scale={}:{}:flags=lanczos", width, h));
    }

    let ext = Path::new(&output).extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
    match ext.as_str() {
        "jpg" | "jpeg" => {
            let jpg_q = match q_mode { "high" => "2", "compact" => "8", _ => "4" };
            args.extend(["-q:v", jpg_q, "-pix_fmt", "yuvj420p"].iter().map(|s| s.to_string()));
        },
        "webp" => {
            let webp_q = match q_mode { "high" => "90", "compact" => "60", _ => "78" };
            args.extend(["-q:v", webp_q].iter().map(|s| s.to_string()));
        },
        "png" => {
            let png_lvl = if q_mode == "compact" { "9" } else { "6" };
            args.extend(["-compression_level", png_lvl].iter().map(|s| s.to_string()));
        },
        _ => {}
    }

    args.push("-y".to_string());
    args.push(output.clone());
    run_ffmpeg_with_telemetry(&app, args, 1, 1, None, None, p_mode, "img", "Image Error").await
}

#[tauri::command]
fn read_file_bytes(path: String) -> Result<Vec<u8>, String> {
    if path.contains("..") {
        return Err("Security Error: Path traversal detected".to_string());
    }
    
    let p = std::path::Path::new(&path);
    if !p.is_absolute() {
        return Err("Security Error: Only absolute paths are allowed".to_string());
    }

    std::fs::read(path).map_err(|e| e.to_string())
}

#[tauri::command]
fn show_in_folder(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .args(["/select,", &path])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .args(["-R", &path])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        let parent = std::path::Path::new(&path).parent().unwrap_or(std::path::Path::new(""));
        std::process::Command::new("xdg-open")
            .arg(parent)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn probe_video(app: AppHandle, input: String) -> Result<String, String> {
    let input_path = Path::new(&input);
    if !input_path.exists() { return Err("Input file not found".to_string()); }

    let probe = probe_media_internal(&app, &input).await?;
    let mock_json = serde_json::json!({
        "format": {
            "duration": probe.duration.to_string()
        },
        "width": probe.width,
        "height": probe.height,
        "bitrate_kbps": probe.bitrate_kbps,
        "has_audio": probe.has_audio
    });

    Ok(serde_json::to_string(&mock_json).unwrap_or("{}".to_string()))
}

#[tauri::command]
fn get_file_size(path: String) -> Result<u64, String> {
    std::fs::metadata(path)
        .map(|m| m.len())
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn compress_video_target_size(
    app: AppHandle,
    cache: State<'_, EncoderCache>,
    input: String,
    output: String,
    target_size_kb: f64,
    auto_gpu: bool,
    perf_mode: Option<String>,
    job_id: Option<String>,
) -> Result<(), String> {
    let abs_input = absolutize_path(&input);
    let abs_output = absolutize_path(&output);
    let input_path = Path::new(&abs_input);
    if !input_path.exists() { return Err("Input file not found".to_string()); }

    let p_mode = perf_mode.as_deref().unwrap_or("balanced");
    let jid = job_id.as_deref().unwrap_or("single");
    let probe = probe_media_internal(&app, &abs_input).await?;
    let duration = probe.duration;

    if duration <= 0.0 {
        return Err("Could not determine video duration".to_string());
    }

    let is_4k = probe.height >= 2160 || probe.width >= 3840;
    let has_audio = probe.has_audio;
    let total_kbps = (target_size_kb * 1024.0 * 8.0) / duration / 1000.0;
    let audio_bitrate_kbps = if !has_audio {
        0.0
    } else if total_kbps < 350.0 {
        64.0
    } else if total_kbps < 700.0 {
        96.0
    } else {
        128.0
    };

    let target_video_bitrate_kbps = (total_kbps * 0.95) - audio_bitrate_kbps;
    if target_video_bitrate_kbps < 50.0 {
        return Err("Target size is too small for this video length".to_string());
    }

    let bitrate_str = format!("{}k", target_video_bitrate_kbps.floor());
    let ext = Path::new(&abs_output).extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
    let is_webm = ext == "webm";
    let is_faststart_mp4 = matches!(ext.as_str(), "mp4" | "mov" | "m4v");
    let (worker_threads, frame_threads) = get_cpu_threads_for_mode(p_mode, is_4k);

    let mut selected_encoder = if is_webm { "libvpx-vp9" } else { "libx265" };
    let mut use_two_pass = true;

    if auto_gpu && !is_webm {
        if let Some(gpu_enc) = select_gpu_hevc_encoder(&app, &cache).await {
            if gpu_enc != "hevc_vaapi" {
                selected_encoder = gpu_enc;
                use_two_pass = false;
            }
        }
    }

    if use_two_pass {
        let ts = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis();
        let temp_pass_dir: PathBuf = app.path().temp_dir().map_err(|e| e.to_string())?.join(format!("compress_2pass_{}", ts));
        std::fs::create_dir_all(&temp_pass_dir).map_err(|e| e.to_string())?;

        let mut args1 = vec![
            "-y".to_string(),
            "-hwaccel".to_string(), "auto".to_string(),
            "-threads".to_string(), worker_threads.to_string(),
            "-protocol_whitelist".to_string(), SAFE_PROTOCOLS.to_string(),
            "-i".to_string(), abs_input.clone(),
            "-c:v".to_string(), selected_encoder.to_string(),
            "-b:v".to_string(), bitrate_str.clone(),
        ];
        if is_webm {
            args1.extend([
                "-pass", "1", "-passlogfile", "vp9_2pass",
                "-row-mt", "1", "-cpu-used", "4",
            ].iter().map(|s| s.to_string()));
        } else {
            args1.extend(vec![
                "-preset".to_string(), "faster".to_string(),
                "-x265-params".to_string(),
                format!("pass=1:stats=x265_2pass.log:no-sao=1:pools={}:frame-threads={}", worker_threads, frame_threads),
            ]);
        }
        args1.extend(vec!["-an".to_string(), "-f".to_string(), "null".to_string()]);
        #[cfg(target_os = "windows")]
        args1.push("NUL".to_string());
        #[cfg(not(target_os = "windows"))]
        args1.push("/dev/null".to_string());

        let pass1_res = run_ffmpeg_with_telemetry(&app, args1, 1, 2, Some(duration), Some(&temp_pass_dir), p_mode, jid, "Pass 1 failed").await;
        if let Err(e) = pass1_res {
            let _ = std::fs::remove_dir_all(&temp_pass_dir);
            return Err(e);
        }

        let mut args2 = vec![
            "-y".to_string(),
            "-hwaccel".to_string(), "auto".to_string(),
            "-threads".to_string(), worker_threads.to_string(),
            "-protocol_whitelist".to_string(), SAFE_PROTOCOLS.to_string(),
            "-i".to_string(), abs_input.clone(),
            "-c:v".to_string(), selected_encoder.to_string(),
            "-b:v".to_string(), bitrate_str.clone(),
        ];
        if is_webm {
            args2.extend([
                "-pass", "2", "-passlogfile", "vp9_2pass",
                "-row-mt", "1", "-cpu-used", "4",
            ].iter().map(|s| s.to_string()));
        } else {
            args2.extend(vec![
                "-preset".to_string(), "faster".to_string(),
                "-pix_fmt".to_string(), "yuv420p".to_string(),
                "-tag:v".to_string(), "hvc1".to_string(),
                "-x265-params".to_string(),
                format!("pass=2:stats=x265_2pass.log:no-sao=1:pools={}:frame-threads={}", worker_threads, frame_threads),
            ]);
        }
        if has_audio {
            let audio_codec = if is_webm { "libopus" } else { "aac" };
            args2.extend(vec![
                "-c:a".to_string(), audio_codec.to_string(),
                "-b:a".to_string(), format!("{}k", audio_bitrate_kbps as u32),
            ]);
        } else {
            args2.push("-an".to_string());
        }
        if is_faststart_mp4 {
            args2.extend(vec!["-movflags".to_string(), "+faststart".to_string()]);
        }
        args2.push(abs_output.clone());

        let pass2_res = run_ffmpeg_with_telemetry(&app, args2, 2, 2, Some(duration), Some(&temp_pass_dir), p_mode, jid, "Pass 2 failed").await;
        let _ = std::fs::remove_dir_all(&temp_pass_dir);
        pass2_res?;
    } else {
        let pix_fmt = if selected_encoder == "hevc_qsv" { "nv12" } else { "yuv420p" };
        let mut args = vec![
            "-y".to_string(), "-hwaccel".to_string(), "auto".to_string(),
            "-threads".to_string(), worker_threads.to_string(),
            "-protocol_whitelist".to_string(), SAFE_PROTOCOLS.to_string(),
            "-i".to_string(), abs_input.clone(),
            "-c:v".to_string(), selected_encoder.to_string(),
            "-pix_fmt".to_string(), pix_fmt.to_string(),
            "-tag:v".to_string(), "hvc1".to_string(),
            "-b:v".to_string(), bitrate_str.clone(),
            "-maxrate".to_string(), bitrate_str.clone(),
            "-bufsize".to_string(), format!("{}k", target_video_bitrate_kbps.floor() * 2.0),
        ];
        if has_audio {
            args.extend(vec![
                "-c:a".to_string(), "aac".to_string(),
                "-b:a".to_string(), format!("{}k", audio_bitrate_kbps as u32),
            ]);
        } else {
            args.push("-an".to_string());
        }
        if is_faststart_mp4 {
            args.extend(vec!["-movflags".to_string(), "+faststart".to_string()]);
        }
        args.push(abs_output.clone());

        run_ffmpeg_with_telemetry(&app, args, 1, 1, Some(duration), None, p_mode, jid, "GPU encode failed").await?;
    }

    Ok(())
}

fn build_image_quality_args(
    worker_threads: usize,
    input: &str,
    output: &str,
    width: &str,
    height: &str,
    q_val: f32,
) -> Vec<String> {
    let mut args = vec![
        "-threads".to_string(), worker_threads.to_string(),
        "-protocol_whitelist".to_string(), SAFE_PROTOCOLS.to_string(),
        "-i".to_string(), input.to_string(),
    ];
    if width != "0" && !width.is_empty() {
        let h = if height.is_empty() || height == "0" { "-1" } else { height };
        args.push("-vf".to_string());
        args.push(format!("scale={}:{}", width, h));
    }
    args.push("-q:v".to_string());
    args.push(q_val.to_string());
    args.push("-y".to_string());
    args.push(output.to_string());
    args
}

#[tauri::command]
async fn compress_image_target_size(
    app: AppHandle,
    input: String,
    output: String,
    target_size_kb: f64,
    width: String,
    height: String,
    perf_mode: Option<String>,
) -> Result<(), String> {
    let input_path = Path::new(&input);
    if !input_path.exists() { return Err("Input file not found".to_string()); }

    let ext = Path::new(&output).extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
    let is_jpg = ext == "jpg" || ext == "jpeg";
    let is_webp = ext == "webp";
    
    if !is_jpg && !is_webp {
        return Err("Target size requires a lossy format like JPG or WebP. Please change output format.".to_string());
    }

    let p_mode = perf_mode.as_deref().unwrap_or("balanced");
    let (worker_threads, _) = get_cpu_threads_for_mode(p_mode, false);
    let mut min_q: f32 = if is_jpg { 2.0 } else { 1.0 }; 
    let mut max_q: f32 = if is_jpg { 31.0 } else { 100.0 };
    let target_bytes = (target_size_kb * 1024.0) as u64;

    let mut best_q = if is_jpg { max_q } else { min_q };
    let ffmpeg_path = ffmpeg_runtime::resolve_ffmpeg_path(&app).await?;
    let mut best_size_diff = u64::MAX;
    let mut last_encoded_q: Option<f32> = None;

    for _i in 0..8 {
        let mid_q = (min_q + max_q) / 2.0;
        let q_val = mid_q.floor();
        if last_encoded_q == Some(q_val) {
            break;
        }
        last_encoded_q = Some(q_val);

        let args = build_image_quality_args(worker_threads, &input, &output, &width, &height, q_val);
        let mut cmd = ffmpeg_runtime::build_ffmpeg_tokio_command(&ffmpeg_path, &args, None);
        cmd.stdout(std::process::Stdio::null()).stderr(std::process::Stdio::null());
        let mut child = cmd.spawn().map_err(|e| e.to_string())?;
        if let Some(pid) = child.id() {
            apply_process_profile(pid, p_mode);
        }
        let success = child.wait().await.map(|s| s.success()).unwrap_or(false);

        if !success {
            continue;
        }

        let current_size = std::fs::metadata(&output).map(|m| m.len()).unwrap_or(0);
        let diff = current_size.abs_diff(target_bytes);

        if current_size <= target_bytes && diff < best_size_diff {
            best_q = mid_q;
            best_size_diff = diff;
            if diff <= target_bytes / 50 {
                return Ok(());
            }
        }

        if current_size > target_bytes {
            if is_jpg { min_q = mid_q; } else { max_q = mid_q; }
        } else if is_jpg {
            max_q = mid_q;
        } else {
            min_q = mid_q;
        }
    }

    let final_q = best_q.floor();
    if last_encoded_q != Some(final_q) {
        let args = build_image_quality_args(worker_threads, &input, &output, &width, &height, final_q);
        let mut cmd = ffmpeg_runtime::build_ffmpeg_tokio_command(&ffmpeg_path, &args, None);
        cmd.stdout(std::process::Stdio::null()).stderr(std::process::Stdio::null());
        let mut child = cmd.spawn().map_err(|e| e.to_string())?;
        if let Some(pid) = child.id() {
            apply_process_profile(pid, p_mode);
        }
        let _ = child.wait().await;
    }

    let final_size = std::fs::metadata(&output).map(|m| m.len()).unwrap_or(0);
    if final_size > target_bytes + (target_bytes / 10) {
        return Err("Cannot compress to this target size without reducing dimensions further.".to_string());
    }

    Ok(())
}

#[tauri::command]
async fn compress_audio(
    app: AppHandle,
    input: String,
    output: String,
    quality: Option<String>,
    perf_mode: Option<String>,
    job_id: Option<String>,
) -> Result<(), String> {
    let input_path = Path::new(&input);
    if !input_path.exists() { return Err("Input file not found".to_string()); }
    let p_mode = perf_mode.as_deref().unwrap_or("balanced");
    let jid = job_id.as_deref().unwrap_or("single");
    let (worker_threads, _) = get_cpu_threads_for_mode(p_mode, false);

    let probe = probe_media_internal(&app, &input).await.unwrap_or(MediaProbe {
        duration: 0.0,
        width: 0,
        height: 0,
        bitrate_kbps: 0.0,
        has_audio: true,
    });
    let known_duration = if probe.duration > 0.0 { Some(probe.duration) } else { None };
    let q_mode = match quality.as_deref() {
        Some(q @ ("high" | "balanced" | "compact")) => q,
        _ => {
            if probe.bitrate_kbps >= 256.0 {
                "high"
            } else if probe.bitrate_kbps > 0.0 && probe.bitrate_kbps <= 112.0 {
                "compact"
            } else {
                "balanced"
            }
        }
    };

    let ext = Path::new(&output).extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
    let mut args = vec![
        "-threads".to_string(), worker_threads.to_string(),
        "-protocol_whitelist".to_string(), SAFE_PROTOCOLS.to_string(),
        "-i".to_string(), input.clone(),
    ];

    let bitrate_k = match q_mode { "high" => "192k", "compact" => "96k", _ => "128k" };
    match ext.as_str() {
        "mp3" => {
            let mp3_q = match q_mode { "high" => "2", "compact" => "6", _ => "4" };
            args.extend(vec!["-c:a".to_string(), "libmp3lame".to_string(), "-q:a".to_string(), mp3_q.to_string()]);
        },
        "aac" | "m4a" => {
            args.extend(vec!["-c:a".to_string(), "aac".to_string(), "-b:a".to_string(), bitrate_k.to_string()]);
        },
        "ogg" | "opus" => {
            let opus_k = match q_mode { "high" => "160k", "compact" => "64k", _ => "96k" };
            args.extend(vec!["-c:a".to_string(), "libopus".to_string(), "-b:a".to_string(), opus_k.to_string()]);
        },
        _ => {
            args.extend(vec!["-b:a".to_string(), bitrate_k.to_string()]);
        }
    }
    
    args.push("-y".to_string());
    args.push(output.clone());

    run_ffmpeg_with_telemetry(&app, args, 1, 1, known_duration, None, p_mode, jid, "Audio Error").await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let startup_files: Vec<String> = std::env::args()
        .skip(1)
        .filter(|arg| !arg.starts_with('-') && !arg.starts_with('/') && Path::new(arg).is_file())
        .collect();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(EncoderCache(Mutex::new(HashMap::new())))
        .manage(ffmpeg_runtime::FfmpegRuntimeState::new())
        .manage(StartupFilesState(Mutex::new(startup_files)))
        .invoke_handler(tauri::generate_handler![
            ffmpeg_runtime::check_ffmpeg_runtime,
            ffmpeg_runtime::ensure_ffmpeg_runtime,
            take_startup_files,
            detect_hardware_tier,
            compress_video, 
            compress_image, 
            compress_audio,
            stop_job, 
            enhance_image,
            enhance_video,
            read_file_bytes,
            probe_video,
            get_file_size,
            compress_video_target_size,
            compress_image_target_size,
            show_in_folder
        ])
        .on_window_event(|_window, event| {
            if let WindowEvent::Destroyed = event {
                #[cfg(target_os = "windows")]
                { 
                    use std::os::windows::process::CommandExt;
                    let _ = StdCommand::new("cmd").args(["/C", "taskkill /F /T /IM ffmpeg*"]).creation_flags(0x08000000).spawn(); 
                    let _ = StdCommand::new("cmd").args(["/C", "taskkill /F /T /IM realesrgan*"]).creation_flags(0x08000000).spawn();
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_fractional_ffmpeg_duration() {
        let stderr = "  Duration: 01:02:03.45, start: 0.000000, bitrate: 1500 kb/s";
        let d = parse_ffmpeg_duration(stderr).unwrap();
        assert!((d - 3723.45).abs() < 1e-6);
    }

    #[test]
    fn parses_resolution_bitrate_and_audio_presence() {
        let sample = "  Duration: 00:05:10.50, start: 0.000000, bitrate: 14200 kb/s\n    Stream #0:0: Video: hevc (Main), yuv420p, 3840x2160, 29.97 fps\n    Stream #0:1: Audio: aac, 48000 Hz";
        let p = parse_media_probe(sample);
        assert!((p.duration - 310.5).abs() < 1e-6);
        assert_eq!(p.width, 3840);
        assert_eq!(p.height, 2160);
        assert!((p.bitrate_kbps - 14200.0).abs() < 1e-6);
        assert!(p.has_audio);
    }

    #[test]
    fn handles_missing_or_na_duration() {
        assert_eq!(parse_ffmpeg_duration("  Duration: N/A, start: 0.0"), None);
        assert_eq!(parse_ffmpeg_duration("no duration header here"), None);
        assert_eq!(parse_ffmpeg_duration("Duration: 00:00:00.00, bitrate: 0"), None);
    }

    #[test]
    fn computes_safe_cpu_thread_bounds_across_modes() {
        for mode in ["eco", "balanced", "turbo"] {
            for is_4k in [false, true] {
                let (workers, frames) = get_cpu_threads_for_mode(mode, is_4k);
                assert!(workers >= 1);
                assert!(frames >= 1 && frames <= workers);
            }
        }
        let (eco_w, eco_f) = get_cpu_threads_for_mode("eco", true);
        let (turbo_w, _) = get_cpu_threads_for_mode("turbo", true);
        assert_eq!(eco_f, 1);
        assert!(eco_w <= turbo_w);
    }

    #[test]
    fn picks_auto_quality_profile_from_probe_and_overrides() {
        let high_4k = MediaProbe { duration: 120.0, width: 3840, height: 2160, bitrate_kbps: 24000.0, has_audio: true };
        let low_4k = MediaProbe { duration: 3.0, width: 3840, height: 2160, bitrate_kbps: 1680.0, has_audio: false };
        let unknown_4k = MediaProbe { duration: 10.0, width: 3840, height: 2160, bitrate_kbps: 0.0, has_audio: true };
        let standard_1080 = MediaProbe { duration: 60.0, width: 1920, height: 1080, bitrate_kbps: 5000.0, has_audio: true };
        let high_1080 = MediaProbe { duration: 60.0, width: 1920, height: 1080, bitrate_kbps: 14000.0, has_audio: true };

        assert_eq!(select_auto_quality_profile(&high_4k, None), "high");
        assert_eq!(select_auto_quality_profile(&unknown_4k, Some("auto")), "high");
        assert_eq!(select_auto_quality_profile(&high_1080, None), "high");
        assert_eq!(select_auto_quality_profile(&low_4k, None), "balanced");
        assert_eq!(select_auto_quality_profile(&standard_1080, None), "balanced");
        assert_eq!(select_auto_quality_profile(&standard_1080, Some("compact")), "compact");
        assert_eq!(select_auto_quality_profile(&low_4k, Some("high")), "high");
    }
}