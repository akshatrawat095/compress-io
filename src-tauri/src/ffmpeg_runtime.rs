use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs::{self, File};
use std::io::{self, Read};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{AsyncRead, AsyncReadExt};
use tokio::process::Command as TokioCommand;

#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;

#[derive(Clone, Copy)]
pub struct FfmpegRuntimeSpec {
    pub runtime_id: &'static str,
    pub url: &'static str,
    pub archive_sha256: &'static str,
    pub archive_kind: &'static str,
    pub bin_name: &'static str,
    pub target_triple: &'static str,
}

#[cfg(all(target_os = "windows", target_arch = "x86_64"))]
pub fn current_runtime_spec() -> &'static FfmpegRuntimeSpec {
    &FfmpegRuntimeSpec {
        runtime_id: "ffmpeg-N-129308-g17de9f8597-win64-gpl",
        url: "https://github.com/BtbN/FFmpeg-Builds/releases/download/autobuild-2026-11-26-12-56/ffmpeg-N-129308-g17de9f8597-win64-gpl.zip",
        archive_sha256: "000df965813043b74b939ad0b8e43237798618539cfae63224d5c732903e09b9",
        archive_kind: "zip",
        bin_name: "ffmpeg.exe",
        target_triple: "x86_64-pc-windows-msvc",
    }
}

#[cfg(all(target_os = "windows", target_arch = "aarch64"))]
pub fn current_runtime_spec() -> &'static FfmpegRuntimeSpec {
    &FfmpegRuntimeSpec {
        runtime_id: "ffmpeg-N-129308-g17de9f8597-winarm64-gpl",
        url: "https://github.com/BtbN/FFmpeg-Builds/releases/download/autobuild-2026-11-26-12-56/ffmpeg-N-129308-g17de9f8597-winarm64-gpl.zip",
        archive_sha256: "3ec20e39c236ce6b564d5e7a9e319748c4e2065982b436e5d009ebd7cb09b57d",
        archive_kind: "zip",
        bin_name: "ffmpeg.exe",
        target_triple: "aarch64-pc-windows-msvc",
    }
}

#[cfg(all(target_os = "macos", target_arch = "aarch64"))]
pub fn current_runtime_spec() -> &'static FfmpegRuntimeSpec {
    &FfmpegRuntimeSpec {
        runtime_id: "ffmpeg-bin-9.0.2-osx-arm64",
        url: "https://github.com/Tyrrrz/FFmpegBin/releases/download/9.0.2/ffmpeg-osx-arm64.zip",
        archive_sha256: "7d22a2893ccd761c3b4214165975e306d6c85c1de188f79f7e2723070c0006e4",
        archive_kind: "zip",
        bin_name: "ffmpeg",
        target_triple: "aarch64-apple-darwin",
    }
}

#[cfg(all(target_os = "macos", target_arch = "x86_64"))]
pub fn current_runtime_spec() -> &'static FfmpegRuntimeSpec {
    &FfmpegRuntimeSpec {
        runtime_id: "ffmpeg-bin-9.0.2-osx-x64",
        url: "https://github.com/Tyrrrz/FFmpegBin/releases/download/9.0.2/ffmpeg-osx-x64.zip",
        archive_sha256: "e1938c2df4024c13eeef068f5561e7782ec4003b3f40b428065147e40b92e9a0",
        archive_kind: "zip",
        bin_name: "ffmpeg",
        target_triple: "x86_64-apple-darwin",
    }
}

#[cfg(all(target_os = "linux", target_arch = "x86_64"))]
pub fn current_runtime_spec() -> &'static FfmpegRuntimeSpec {
    &FfmpegRuntimeSpec {
        runtime_id: "ffmpeg-N-129308-g17de9f8597-linux64-gpl",
        url: "https://github.com/BtbN/FFmpeg-Builds/releases/download/autobuild-2026-11-26-12-56/ffmpeg-N-129308-g17de9f8597-linux64-gpl.tar.xz",
        archive_sha256: "1626509a8649d8d392ecddd9969c087e9f50df7a75f8164b5b0b4eee55a59428",
        archive_kind: "tar.xz",
        bin_name: "ffmpeg",
        target_triple: "x86_64-unknown-linux-gnu",
    }
}

#[cfg(all(target_os = "linux", target_arch = "aarch64"))]
pub fn current_runtime_spec() -> &'static FfmpegRuntimeSpec {
    &FfmpegRuntimeSpec {
        runtime_id: "ffmpeg-N-129308-g17de9f8597-linuxarm64-gpl",
        url: "https://github.com/BtbN/FFmpeg-Builds/releases/download/autobuild-2026-11-26-12-56/ffmpeg-N-129308-g17de9f8597-linuxarm64-gpl.tar.xz",
        archive_sha256: "f496fe46d273feee1c9bee100d329256a972a099734f843f86e2b030761103f5",
        archive_kind: "tar.xz",
        bin_name: "ffmpeg",
        target_triple: "aarch64-unknown-linux-gnu",
    }
}

#[cfg(not(any(
    all(target_os = "windows", target_arch = "x86_64"),
    all(target_os = "windows", target_arch = "aarch64"),
    all(target_os = "macos", target_arch = "aarch64"),
    all(target_os = "macos", target_arch = "x86_64"),
    all(target_os = "linux", target_arch = "x86_64"),
    all(target_os = "linux", target_arch = "aarch64")
)))]
pub fn current_runtime_spec() -> &'static FfmpegRuntimeSpec {
    &FfmpegRuntimeSpec {
        runtime_id: "unsupported",
        url: "",
        archive_sha256: "",
        archive_kind: "",
        bin_name: if cfg!(windows) { "ffmpeg.exe" } else { "ffmpeg" },
        target_triple: "unsupported",
    }
}

pub struct FfmpegRuntimeState {
    cached_path: Mutex<Option<PathBuf>>,
    install_lock: tokio::sync::Mutex<()>,
}

impl FfmpegRuntimeState {
    pub fn new() -> Self {
        Self {
            cached_path: Mutex::new(None),
            install_lock: tokio::sync::Mutex::new(()),
        }
    }
}

#[derive(Clone, Serialize, Deserialize)]
struct RuntimeReceipt {
    runtime_id: String,
    archive_sha256: String,
    binary_sha256: String,
    binary_size: u64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FfmpegRuntimeStatus {
    pub ready: bool,
    pub source: String,
    pub runtime_id: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct FfmpegSetupProgress {
    stage: String,
    downloaded_bytes: u64,
    total_bytes: u64,
    percent: f64,
}

fn hex_lower(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

pub fn sha256_file(path: &Path) -> Result<(String, u64), String> {
    let mut file = File::open(path).map_err(|e| format!("Failed to open file for hashing: {}", e))?;
    let mut hasher = Sha256::new();
    let mut buf = [0u8; 65536];
    let mut total = 0_u64;
    loop {
        let n = file.read(&mut buf).map_err(|e| format!("Failed reading file for SHA-256: {}", e))?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
        total += n as u64;
    }
    Ok((hex_lower(&hasher.finalize()), total))
}

fn runtime_cache_dir(app: &AppHandle, spec: &FfmpegRuntimeSpec) -> Result<PathBuf, String> {
    let base = app
        .path()
        .app_local_data_dir()
        .or_else(|_| app.path().app_data_dir())
        .map_err(|e| format!("Unable to resolve app data directory: {}", e))?;
    Ok(base.join("runtimes").join("ffmpeg").join(spec.runtime_id))
}

fn verify_cached_binary(cache_dir: &Path, spec: &FfmpegRuntimeSpec) -> Option<PathBuf> {
    let bin_path = cache_dir.join(spec.bin_name);
    let receipt_path = cache_dir.join("receipt.json");
    if !bin_path.is_file() || !receipt_path.is_file() {
        return None;
    }

    let raw = fs::read_to_string(&receipt_path).ok()?;
    let receipt: RuntimeReceipt = serde_json::from_str(&raw).ok()?;
    if receipt.runtime_id != spec.runtime_id || receipt.archive_sha256 != spec.archive_sha256 {
        return None;
    }

    let meta = fs::metadata(&bin_path).ok()?;
    if meta.len() != receipt.binary_size || meta.len() == 0 {
        return None;
    }

    let (actual_hash, _) = sha256_file(&bin_path).ok()?;
    if actual_hash != receipt.binary_sha256 {
        return None;
    }

    Some(bin_path)
}

fn find_sibling_or_dev_binary(spec: &FfmpegRuntimeSpec) -> Option<(PathBuf, &'static str)> {
    let triple_name = if cfg!(windows) {
        format!("ffmpeg-{}.exe", spec.target_triple)
    } else {
        format!("ffmpeg-{}", spec.target_triple)
    };

    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            for candidate in [
                dir.join(spec.bin_name),
                dir.join(&triple_name),
                dir.join("binaries").join(&triple_name),
            ] {
                if candidate.is_file() {
                    return Some((candidate, "bundled"));
                }
            }
        }
    }

    #[cfg(debug_assertions)]
    {
        let dev_bin = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("binaries")
            .join(&triple_name);
        if dev_bin.is_file() {
            return Some((dev_bin, "dev-binary"));
        }
    }

    None
}

fn find_existing_ffmpeg(app: &AppHandle) -> Option<(PathBuf, &'static str)> {
    let spec = current_runtime_spec();
    let state = app.state::<FfmpegRuntimeState>();
    {
        let guard = state.cached_path.lock().unwrap();
        if let Some(ref p) = *guard {
            if p.is_file() {
                return Some((p.clone(), "cached"));
            }
        }
    }

    if let Ok(cache_dir) = runtime_cache_dir(app, spec) {
        if let Some(verified) = verify_cached_binary(&cache_dir, spec) {
            let mut guard = state.cached_path.lock().unwrap();
            *guard = Some(verified.clone());
            return Some((verified, "cached"));
        }
    }

    if let Some((path, source)) = find_sibling_or_dev_binary(spec) {
        let mut guard = state.cached_path.lock().unwrap();
        *guard = Some(path.clone());
        return Some((path, source));
    }

    None
}

fn extract_zip_binary(archive_path: &Path, bin_name: &str, dest_tmp: &Path) -> Result<(), String> {
    let file = File::open(archive_path).map_err(|e| format!("Failed opening archive: {}", e))?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("Invalid ZIP archive: {}", e))?;

    for i in 0..archive.len() {
        let mut entry = archive
            .by_index(i)
            .map_err(|e| format!("Failed reading ZIP entry: {}", e))?;
        if entry.is_dir() {
            continue;
        }
        let matches_bin = entry
            .name()
            .map_err(|e| format!("Invalid ZIP entry name: {}", e))?
            .rsplit(['/', '\\'])
            .next()
            == Some(bin_name);
        if matches_bin {
            let mut out = File::create(dest_tmp)
                .map_err(|e| format!("Failed creating extracted binary: {}", e))?;
            io::copy(&mut entry, &mut out)
                .map_err(|e| format!("Failed extracting FFmpeg from ZIP: {}", e))?;
            return Ok(());
        }
    }

    Err(format!("FFmpeg binary '{}' not found inside archive", bin_name))
}

#[cfg(target_os = "linux")]
fn find_file_named_recursive(dir: &Path, file_name: &str) -> Option<PathBuf> {
    let entries = fs::read_dir(dir).ok()?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            if let Some(found) = find_file_named_recursive(&path, file_name) {
                return Some(found);
            }
        } else if path.is_file()
            && path.file_name().and_then(|s| s.to_str()) == Some(file_name)
        {
            return Some(path);
        }
    }
    None
}

#[cfg(target_os = "linux")]
fn extract_tar_xz_binary(
    archive_path: &Path,
    staging_dir: &Path,
    bin_name: &str,
    dest_tmp: &Path,
) -> Result<(), String> {
    let extract_dir = staging_dir.join("unpacked");
    let _ = fs::remove_dir_all(&extract_dir);
    fs::create_dir_all(&extract_dir).map_err(|e| e.to_string())?;

    let status = std::process::Command::new("tar")
        .arg("-xf")
        .arg(archive_path)
        .arg("-C")
        .arg(&extract_dir)
        .status()
        .map_err(|e| format!("Failed invoking tar for FFmpeg extraction: {}", e))?;

    if !status.success() {
        return Err(format!("tar extraction failed with exit code {:?}", status.code()));
    }

    let found = find_file_named_recursive(&extract_dir, bin_name)
        .ok_or_else(|| format!("FFmpeg binary '{}' not found inside tarball", bin_name))?;

    fs::copy(&found, dest_tmp).map_err(|e| format!("Failed moving extracted FFmpeg: {}", e))?;
    Ok(())
}

async fn ensure_ffmpeg_runtime_internal(app: &AppHandle) -> Result<PathBuf, String> {
    let spec = current_runtime_spec();
    if spec.url.is_empty() {
        return Err(format!(
            "No prebuilt FFmpeg runtime manifest is configured for architecture '{}'.",
            std::env::consts::ARCH
        ));
    }

    let state = app.state::<FfmpegRuntimeState>();
    let _guard = state.install_lock.lock().await;

    if let Some((path, _)) = find_existing_ffmpeg(app) {
        let _ = app.emit(
            "ffmpeg-setup-progress",
            FfmpegSetupProgress {
                stage: "ready".to_string(),
                downloaded_bytes: 0,
                total_bytes: 0,
                percent: 100.0,
            },
        );
        return Ok(path);
    }

    let cache_dir = runtime_cache_dir(app, spec)?;
    let staging_dir = cache_dir.join("staging");
    let _ = fs::remove_dir_all(&staging_dir);
    fs::create_dir_all(&staging_dir).map_err(|e| format!("Failed creating runtime dir: {}", e))?;

    let archive_path = staging_dir.join("ffmpeg_archive.tmp");
    let bin_tmp_path = staging_dir.join(format!("{}.tmp", spec.bin_name));

    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(30))
        .user_agent("Compress-IO/0.1")
        .build()
        .map_err(|e| format!("HTTP client error: {}", e))?;

    let mut response = client
        .get(spec.url)
        .send()
        .await
        .map_err(|e| format!("Network error downloading FFmpeg: {}", e))?;

    if !response.status().is_success() {
        return Err(format!(
            "Failed to download FFmpeg runtime (HTTP {})",
            response.status()
        ));
    }

    let total_bytes = response.content_length().unwrap_or(0);
    let mut downloaded_bytes = 0_u64;
    let mut hasher = Sha256::new();
    let mut out_file =
        tokio::fs::File::create(&archive_path)
            .await
            .map_err(|e| format!("Failed creating download file: {}", e))?;

    use tokio::io::AsyncWriteExt;
    let mut last_emit = Instant::now() - Duration::from_secs(1);

    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|e| format!("Download interrupted: {}", e))?
    {
        out_file
            .write_all(&chunk)
            .await
            .map_err(|e| format!("Disk write error: {}", e))?;
        hasher.update(&chunk);
        downloaded_bytes += chunk.len() as u64;

        if last_emit.elapsed() >= Duration::from_millis(140) {
            let pct = if total_bytes > 0 {
                ((downloaded_bytes as f64 / total_bytes as f64) * 92.0).clamp(1.0, 92.0)
            } else {
                25.0
            };
            let _ = app.emit(
                "ffmpeg-setup-progress",
                FfmpegSetupProgress {
                    stage: "downloading".to_string(),
                    downloaded_bytes,
                    total_bytes,
                    percent: pct,
                },
            );
            last_emit = Instant::now();
        }
    }

    out_file
        .flush()
        .await
        .map_err(|e| format!("Failed flushing download buffer: {}", e))?;
    drop(out_file);

    let _ = app.emit(
        "ffmpeg-setup-progress",
        FfmpegSetupProgress {
            stage: "verifying".to_string(),
            downloaded_bytes,
            total_bytes,
            percent: 94.0,
        },
    );

    let actual_archive_sha = hex_lower(&hasher.finalize());
    if actual_archive_sha != spec.archive_sha256 {
        let _ = fs::remove_dir_all(&staging_dir);
        return Err(format!(
            "FFmpeg SHA-256 verification failed! Expected {}, got {}",
            spec.archive_sha256, actual_archive_sha
        ));
    }

    let _ = app.emit(
        "ffmpeg-setup-progress",
        FfmpegSetupProgress {
            stage: "extracting".to_string(),
            downloaded_bytes,
            total_bytes,
            percent: 96.0,
        },
    );

    let archive_clone = archive_path.clone();
    let staging_clone = staging_dir.clone();
    let bin_tmp_clone = bin_tmp_path.clone();
    let bin_name = spec.bin_name;
    let kind = spec.archive_kind;

    let final_bin_path = cache_dir.join(spec.bin_name);
    let receipt_path = cache_dir.join("receipt.json");
    let final_bin_clone = final_bin_path.clone();
    let runtime_id = spec.runtime_id.to_string();
    let archive_sha = spec.archive_sha256.to_string();

    tokio::task::spawn_blocking(move || -> Result<(), String> {
        match kind {
            "zip" => extract_zip_binary(&archive_clone, bin_name, &bin_tmp_clone)?,
            #[cfg(target_os = "linux")]
            "tar.xz" => extract_tar_xz_binary(&archive_clone, &staging_clone, bin_name, &bin_tmp_clone)?,
            other => return Err(format!("Unsupported archive format: {}", other)),
        }

        #[cfg(unix)]
        {
            fs::set_permissions(&bin_tmp_clone, fs::Permissions::from_mode(0o755))
                .map_err(|e| format!("Failed setting executable permissions: {}", e))?;
        }

        let (binary_sha256, binary_size) = sha256_file(&bin_tmp_clone)?;
        if final_bin_clone.exists() {
            let _ = fs::remove_file(&final_bin_clone);
        }
        fs::rename(&bin_tmp_clone, &final_bin_clone)
            .map_err(|e| format!("Failed installing FFmpeg binary: {}", e))?;

        let receipt = RuntimeReceipt {
            runtime_id,
            archive_sha256: archive_sha,
            binary_sha256,
            binary_size,
        };
        let receipt_json = serde_json::to_string_pretty(&receipt)
            .map_err(|e| format!("Failed serializing receipt: {}", e))?;
        fs::write(&receipt_path, receipt_json)
            .map_err(|e| format!("Failed writing runtime receipt: {}", e))?;

        let _ = fs::remove_dir_all(&staging_clone);
        Ok(())
    })
    .await
    .map_err(|e| format!("Runtime extraction task failed: {}", e))??;

    {
        let mut guard = state.cached_path.lock().unwrap();
        *guard = Some(final_bin_path.clone());
    }

    let _ = app.emit(
        "ffmpeg-setup-progress",
        FfmpegSetupProgress {
            stage: "ready".to_string(),
            downloaded_bytes,
            total_bytes,
            percent: 100.0,
        },
    );

    Ok(final_bin_path)
}

#[tauri::command]
pub async fn check_ffmpeg_runtime(app: AppHandle) -> Result<FfmpegRuntimeStatus, String> {
    let spec = current_runtime_spec();
    if let Some((_, source)) = find_existing_ffmpeg(&app) {
        Ok(FfmpegRuntimeStatus {
            ready: true,
            source: source.to_string(),
            runtime_id: spec.runtime_id.to_string(),
        })
    } else {
        Ok(FfmpegRuntimeStatus {
            ready: false,
            source: "missing".to_string(),
            runtime_id: spec.runtime_id.to_string(),
        })
    }
}

#[tauri::command]
pub async fn ensure_ffmpeg_runtime(app: AppHandle) -> Result<FfmpegRuntimeStatus, String> {
    let spec = current_runtime_spec();
    ensure_ffmpeg_runtime_internal(&app).await?;
    Ok(FfmpegRuntimeStatus {
        ready: true,
        source: "cached".to_string(),
        runtime_id: spec.runtime_id.to_string(),
    })
}

pub async fn resolve_ffmpeg_path(app: &AppHandle) -> Result<PathBuf, String> {
    if let Some((path, _)) = find_existing_ffmpeg(app) {
        return Ok(path);
    }
    ensure_ffmpeg_runtime_internal(app).await
}

pub fn build_ffmpeg_tokio_command(
    ffmpeg_path: &Path,
    args: &[String],
    work_dir: Option<&Path>,
) -> TokioCommand {
    let mut cmd = TokioCommand::new(ffmpeg_path);
    cmd.args(args).kill_on_drop(true);
    if let Some(dir) = work_dir {
        cmd.current_dir(dir);
    }
    #[cfg(target_os = "windows")]
    {
        cmd.creation_flags(0x08000000);
    }
    cmd
}

pub async fn run_ffmpeg_output(
    app: &AppHandle,
    args: &[String],
) -> Result<std::process::Output, String> {
    let ffmpeg_path = resolve_ffmpeg_path(app).await?;
    let mut cmd = build_ffmpeg_tokio_command(&ffmpeg_path, args, None);
    cmd.output()
        .await
        .map_err(|e| format!("Failed to execute FFmpeg: {}", e))
}

/// Streams CR/LF-delimited lines from stdout or stderr into an async mpsc channel.
pub async fn stream_pipe_lines<R: AsyncRead + Unpin + Send + 'static>(
    mut reader: R,
    tx: tokio::sync::mpsc::Sender<(bool, Vec<u8>)>,
    is_stderr: bool,
) {
    let mut buf = [0u8; 4096];
    let mut line = Vec::new();
    loop {
        match reader.read(&mut buf).await {
            Ok(0) | Err(_) => {
                if !line.is_empty() {
                    let _ = tx.send((is_stderr, std::mem::take(&mut line))).await;
                }
                break;
            }
            Ok(n) => {
                for &b in &buf[..n] {
                    if b == b'\n' || b == b'\r' {
                        if !line.is_empty() {
                            let _ = tx.send((is_stderr, std::mem::take(&mut line))).await;
                        }
                    } else {
                        line.push(b);
                    }
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_pinned_runtime_spec() {
        let spec = current_runtime_spec();
        if !spec.url.is_empty() {
            assert!(spec.url.starts_with("https://"));
            assert_eq!(spec.archive_sha256.len(), 64);
            assert!(spec.archive_sha256.chars().all(|c| c.is_ascii_hexdigit()));
        }
    }

    #[test]
    fn verifies_cached_binary_and_detects_tampering() {
        let temp_dir = std::env::temp_dir().join(format!(
            "compress_io_rt_test_{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&temp_dir).unwrap();

        let spec = current_runtime_spec();
        let bin_path = temp_dir.join(spec.bin_name);
        fs::write(&bin_path, b"valid-ffmpeg-bytes").unwrap();
        let (hash, size) = sha256_file(&bin_path).unwrap();

        let receipt = RuntimeReceipt {
            runtime_id: spec.runtime_id.to_string(),
            archive_sha256: spec.archive_sha256.to_string(),
            binary_sha256: hash,
            binary_size: size,
        };
        fs::write(
            temp_dir.join("receipt.json"),
            serde_json::to_string(&receipt).unwrap(),
        )
        .unwrap();

        assert!(verify_cached_binary(&temp_dir, spec).is_some());

        // Tamper with binary bytes while preserving size
        fs::write(&bin_path, b"tampr-ffmpeg-bytes").unwrap();
        assert!(verify_cached_binary(&temp_dir, spec).is_none());

        let _ = fs::remove_dir_all(&temp_dir);
    }
}
