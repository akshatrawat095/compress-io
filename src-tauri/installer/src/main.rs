#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::Cursor;
use std::os::windows::process::CommandExt;
use std::path::{Component, Path, PathBuf};
use std::process::Command;
use std::thread;
use std::time::Duration;
use tao::dpi::LogicalSize;
use tao::event::{Event, WindowEvent};
use tao::event_loop::{ControlFlow, EventLoopBuilder, EventLoopProxy};
use tao::platform::windows::WindowExtWindows;
use tao::window::WindowBuilder;
use winreg::enums::{HKEY_CURRENT_USER, KEY_READ, KEY_WRITE};
use winreg::RegKey;
use wry::{WebContext, WebViewBuilder};

const EMBEDDED_UI_HTML: &str = include_str!("ui.html");
const EMBEDDED_BUNDLE_TAR_BR: &[u8] = include_bytes!(concat!(env!("OUT_DIR"), "/app_bundle.tar.br"));
const APP_VERSION: &str = env!("COMPRESS_IO_VERSION");

const PRODUCT_NAME: &str = "compress-io";
const DISPLAY_NAME: &str = "Compress I/O";
const SHORTCUT_NAME: &str = "Compress IO";
const MAIN_BIN_NAME: &str = "universal-compressor.exe";
const INSTALL_MANIFEST_NAME: &str = "install-manifest.json";
const CREATE_NO_WINDOW: u32 = 0x08000000;

const CONTEXT_MENU_EXTENSIONS: &[&str] = &[
    ".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tiff",
    ".mp4", ".mkv", ".avi", ".mov", ".webm", ".flv", ".wmv", ".m4v", ".ts", ".ogv", ".gif",
    ".mp3", ".wav", ".flac", ".aac", ".m4a", ".ogg", ".opus", ".wma",
];

#[derive(Debug, Clone)]
enum UserEvent {
    Drag,
    Minimize,
    Browse(String),
    Progress { percent: f64, label: String },
    Error(String),
    Exit,
}

#[derive(Deserialize)]
#[serde(tag = "cmd", rename_all = "camelCase")]
enum IpcCommand {
    Drag,
    Minimize,
    Close,
    Browse {
        #[serde(rename = "currentDir")]
        current_dir: String,
    },
    Install {
        #[serde(rename = "installDir")]
        install_dir: String,
        #[serde(rename = "desktopShortcut")]
        desktop_shortcut: bool,
        #[serde(rename = "contextMenu")]
        context_menu: bool,
        #[serde(rename = "launchAfter")]
        launch_after: bool,
    },
    Uninstall {
        #[serde(rename = "removeRuntimeCache")]
        remove_runtime_cache: bool,
    },
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TargetPathInfo {
    path: String,
    free_text: String,
    needs_elevation: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct InitConfig {
    mode: &'static str,
    version: &'static str,
    installed_version: Option<String>,
    relation: &'static str,
    install_dir: String,
    free_text: String,
    needs_elevation: bool,
    ffmpeg_cached: bool,
    auto_start: bool,
    desktop_shortcut: bool,
    context_menu: bool,
    launch_after: bool,
}

#[derive(Serialize)]
struct ProgressPayload {
    percent: f64,
    label: String,
}

#[derive(Serialize, Deserialize, Default)]
struct InstallManifest {
    version: String,
    install_dir: String,
    files: Vec<String>,
    desktop_shortcut: bool,
    context_menu: bool,
}

struct CliOptions {
    is_uninstall: bool,
    is_silent: bool,
    is_relaunch: bool,
    auto_start: bool,
    desktop_shortcut: bool,
    context_menu: bool,
    launch_after: bool,
    custom_dir: Option<PathBuf>,
}

fn parse_cli_args<I, S>(args: I) -> CliOptions
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    let mut is_uninstall = false;
    let mut is_silent = false;
    let mut is_relaunch = false;
    let mut auto_start = false;
    let mut desktop_shortcut = true;
    let mut context_menu = true;
    let mut launch_after = true;
    let mut custom_dir: Option<PathBuf> = None;

    for raw in args {
        let arg = raw.as_ref();
        let lower = arg.to_ascii_lowercase();
        if lower == "--uninstall" || lower == "/uninstall" {
            is_uninstall = true;
        } else if lower == "/s" || lower == "--silent" || lower == "/p" || lower == "--quiet" {
            is_silent = true;
        } else if lower == "/r" || lower == "--relaunch" {
            is_relaunch = true;
        } else if lower == "--auto" || lower == "/auto" {
            auto_start = true;
        } else if lower == "--no-desktop" || lower == "/no_desktop" {
            desktop_shortcut = false;
        } else if lower == "--no-context" || lower == "/no_context" {
            context_menu = false;
        } else if lower == "--no-launch" || lower == "/no_launch" {
            launch_after = false;
        } else if let Some(val) = arg.strip_prefix("/D=").or_else(|| arg.strip_prefix("/d=")) {
            let clean = val.trim().trim_matches('"');
            if !clean.is_empty() {
                custom_dir = Some(PathBuf::from(clean));
            }
        } else if let Some(val) = arg.strip_prefix("--install-dir=") {
            let clean = val.trim().trim_matches('"');
            if !clean.is_empty() {
                custom_dir = Some(PathBuf::from(clean));
            }
        }
    }

    CliOptions {
        is_uninstall,
        is_silent,
        is_relaunch,
        auto_start,
        desktop_shortcut,
        context_menu,
        launch_after,
        custom_dir,
    }
}

fn parse_cli_options() -> CliOptions {
    parse_cli_args(std::env::args().skip(1))
}

fn parse_semver(v: &str) -> Option<(u64, u64, u64)> {
    let clean = v.trim().trim_start_matches(['v', 'V']);
    let mut parts = clean.split(['.', '-', '+']);
    let maj = parts.next()?.parse::<u64>().ok()?;
    let min = parts.next()?.parse::<u64>().ok()?;
    let pat = parts.next()?.parse::<u64>().ok()?;
    Some((maj, min, pat))
}

fn compare_semver_relation(installed: Option<&str>, incoming: &str) -> &'static str {
    let Some(inst_str) = installed else {
        return "fresh";
    };
    let (Some(inst), Some(inc)) = (parse_semver(inst_str), parse_semver(incoming)) else {
        return "upgrade";
    };
    if inc > inst {
        "upgrade"
    } else if inc == inst {
        "reinstall"
    } else {
        "downgrade"
    }
}

fn default_install_dir() -> Result<PathBuf, String> {
    let base = dirs::data_local_dir()
        .ok_or_else(|| "Unable to resolve %LOCALAPPDATA% directory.".to_string())?;
    Ok(base.join(PRODUCT_NAME))
}

fn runtime_data_dir() -> Option<PathBuf> {
    dirs::data_local_dir().map(|d| d.join("com.compress.io"))
}

fn check_ffmpeg_cached() -> bool {
    let Some(rt) = runtime_data_dir() else {
        return false;
    };
    let ff_dir = rt.join("runtimes").join("ffmpeg");
    let Ok(entries) = fs::read_dir(ff_dir) else {
        return false;
    };
    for entry in entries.flatten() {
        let p = entry.path();
        if p.is_dir() && p.join("ffmpeg.exe").is_file() && p.join("receipt.json").is_file() {
            return true;
        }
    }
    false
}

fn read_existing_install_info() -> (Option<PathBuf>, Option<String>) {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let uninst_subkey = format!(
        "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{}",
        PRODUCT_NAME
    );

    if let Ok(key) = hkcu.open_subkey_with_flags(&uninst_subkey, KEY_READ) {
        let loc: Option<String> = key
            .get_value::<String, _>("InstallLocation")
            .ok()
            .map(|s| s.trim().trim_matches('"').to_string())
            .filter(|s| !s.is_empty());
        let ver: Option<String> = key
            .get_value::<String, _>("DisplayVersion")
            .ok()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());
        if let Some(ref p) = loc {
            if Path::new(p).join(MAIN_BIN_NAME).is_file() {
                return (Some(PathBuf::from(p)), ver);
            }
        }
    }

    if let Ok(mkey) = hkcu.open_subkey_with_flags(format!("Software\\compress\\{}", PRODUCT_NAME), KEY_READ) {
        if let Ok(loc) = mkey.get_value::<String, _>("") {
            let p = PathBuf::from(loc.trim().trim_matches('"'));
            if p.join(MAIN_BIN_NAME).is_file() {
                return (Some(p), None);
            }
        }
    }

    if let Ok(def) = default_install_dir() {
        if def.join(MAIN_BIN_NAME).is_file() {
            return (Some(def), None);
        }
    }

    (None, None)
}

fn normalize_target_dir(chosen: &Path) -> PathBuf {
    if chosen.join(MAIN_BIN_NAME).is_file() {
        return chosen.to_path_buf();
    }
    let last_is_app = chosen
        .file_name()
        .and_then(|s| s.to_str())
        .map(|s| s.eq_ignore_ascii_case(PRODUCT_NAME) || s.eq_ignore_ascii_case(DISPLAY_NAME))
        .unwrap_or(false);
    if last_is_app {
        chosen.to_path_buf()
    } else {
        chosen.join(PRODUCT_NAME)
    }
}

fn nearest_existing_ancestor(path: &Path) -> PathBuf {
    let mut cur = path.to_path_buf();
    while !cur.exists() {
        match cur.parent() {
            Some(p) if !p.as_os_str().is_empty() => cur = p.to_path_buf(),
            _ => break,
        }
    }
    cur
}

fn format_bytes(bytes: u64) -> String {
    const GB: f64 = 1024.0 * 1024.0 * 1024.0;
    const MB: f64 = 1024.0 * 1024.0;
    if (bytes as f64) >= GB {
        format!("{:.1} GB free", (bytes as f64) / GB)
    } else {
        format!("{:.0} MB free", (bytes as f64) / MB)
    }
}

#[cfg(windows)]
fn query_free_space_text(path: &Path) -> String {
    use windows::core::HSTRING;
    use windows::Win32::Storage::FileSystem::GetDiskFreeSpaceExW;

    let ancestor = nearest_existing_ancestor(path);
    let mut avail = 0_u64;
    let ok = unsafe {
        GetDiskFreeSpaceExW(
            &HSTRING::from(ancestor.as_os_str()),
            Some(&mut avail),
            None,
            None,
        )
        .is_ok()
    };
    if ok {
        format_bytes(avail)
    } else {
        "Disk Ready".to_string()
    }
}

#[cfg(not(windows))]
fn query_free_space_text(_path: &Path) -> String {
    "Disk Ready".to_string()
}

fn can_write_to_dir(dir: &Path) -> bool {
    let check_dir = if dir.exists() {
        dir.to_path_buf()
    } else {
        nearest_existing_ancestor(dir)
    };
    let probe = check_dir.join(format!(".compress_io_perm_{}", std::process::id()));
    match File::create(&probe) {
        Ok(f) => {
            drop(f);
            let _ = fs::remove_file(&probe);
            true
        }
        Err(_) => false,
    }
}

fn build_target_info(dir: &Path) -> TargetPathInfo {
    TargetPathInfo {
        path: dir.to_string_lossy().to_string(),
        free_text: query_free_space_text(dir),
        needs_elevation: !can_write_to_dir(dir),
    }
}

fn start_menu_shortcut_path() -> Option<PathBuf> {
    dirs::data_dir().map(|d| {
        d.join("Microsoft")
            .join("Windows")
            .join("Start Menu")
            .join("Programs")
            .join(format!("{}.lnk", SHORTCUT_NAME))
    })
}

fn legacy_start_menu_shortcut_path() -> Option<PathBuf> {
    dirs::data_dir().map(|d| {
        d.join("Microsoft")
            .join("Windows")
            .join("Start Menu")
            .join("Programs")
            .join(format!("{}.lnk", PRODUCT_NAME))
    })
}

fn desktop_shortcut_path() -> Option<PathBuf> {
    dirs::desktop_dir().map(|d| d.join(format!("{}.lnk", SHORTCUT_NAME)))
}

fn legacy_desktop_shortcut_path() -> Option<PathBuf> {
    dirs::desktop_dir().map(|d| d.join(format!("{}.lnk", PRODUCT_NAME)))
}

fn remove_broken_slash_shortcut(base_dir: Option<PathBuf>) {
    if let Some(dir) = base_dir {
        let broken_dir = dir.join("Compress I");
        let _ = fs::remove_file(broken_dir.join("O.lnk"));
        let _ = fs::remove_dir(&broken_dir);
    }
}

fn cleanup_legacy_shortcuts() {
    for legacy in [legacy_start_menu_shortcut_path(), legacy_desktop_shortcut_path()] {
        if let Some(p) = legacy {
            let _ = fs::remove_file(p);
        }
    }
    let programs_dir = dirs::data_dir().map(|d| {
        d.join("Microsoft")
            .join("Windows")
            .join("Start Menu")
            .join("Programs")
    });
    remove_broken_slash_shortcut(programs_dir);
    remove_broken_slash_shortcut(dirs::desktop_dir());
}

fn kill_running_app() {
    let _ = Command::new("taskkill")
        .args(["/F", "/IM", MAIN_BIN_NAME])
        .creation_flags(CREATE_NO_WINDOW)
        .output();
    thread::sleep(Duration::from_millis(250));
}

#[cfg(windows)]
fn apply_rounded_corners(hwnd_raw: isize) {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::Graphics::Dwm::{
        DwmSetWindowAttribute, DWMWINDOWATTRIBUTE, DWM_WINDOW_CORNER_PREFERENCE, DWMWCP_ROUND,
    };
    unsafe {
        let hwnd = HWND(hwnd_raw as *mut core::ffi::c_void);
        let pref: DWM_WINDOW_CORNER_PREFERENCE = DWMWCP_ROUND;
        let _ = DwmSetWindowAttribute(
            hwnd,
            DWMWINDOWATTRIBUTE(33),
            (&pref as *const DWM_WINDOW_CORNER_PREFERENCE).cast(),
            std::mem::size_of::<DWM_WINDOW_CORNER_PREFERENCE>() as u32,
        );
    }
}

#[cfg(windows)]
fn pick_install_folder(hwnd_raw: isize, current_dir: &str) -> Option<PathBuf> {
    use windows::core::HSTRING;
    use windows::Win32::Foundation::HWND;
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize, CLSCTX_INPROC_SERVER,
        COINIT_APARTMENTTHREADED,
    };
    use windows::Win32::UI::Shell::{
        FileOpenDialog, IFileOpenDialog, IShellItem, SHCreateItemFromParsingName,
        FOS_FORCEFILESYSTEM, FOS_PICKFOLDERS, SIGDN_FILESYSPATH,
    };

    unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        let picked: Option<PathBuf> = (|| {
            let dialog: IFileOpenDialog =
                CoCreateInstance(&FileOpenDialog, None, CLSCTX_INPROC_SERVER).ok()?;
            let opts = dialog.GetOptions().ok()?;
            dialog
                .SetOptions(opts | FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM)
                .ok()?;
            let _ = dialog.SetTitle(&HSTRING::from("Choose Compress I/O Install Folder"));

            let start_dir = nearest_existing_ancestor(Path::new(current_dir));
            if let Ok(item) =
                SHCreateItemFromParsingName::<_, _, IShellItem>(&HSTRING::from(start_dir.as_os_str()), None)
            {
                let _ = dialog.SetFolder(&item);
            }

            let hwnd = HWND(hwnd_raw as *mut core::ffi::c_void);
            if dialog.Show(Some(hwnd)).is_err() {
                return None;
            }
            let result = dialog.GetResult().ok()?;
            let pwstr = result.GetDisplayName(SIGDN_FILESYSPATH).ok()?;
            let path_str = pwstr.to_string().ok();
            CoTaskMemFree(Some(pwstr.as_ptr().cast()));
            path_str.map(PathBuf::from)
        })();
        CoUninitialize();
        picked
    }
}

#[cfg(windows)]
fn relaunch_elevated_install(
    hwnd_raw: isize,
    install_dir: &Path,
    desktop: bool,
    context: bool,
    launch: bool,
) -> Result<(), String> {
    use windows::core::{w, HSTRING};
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::Shell::ShellExecuteW;
    use windows::Win32::UI::WindowsAndMessaging::SW_SHOW;

    let self_exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let mut args = vec![
        "--auto".to_string(),
        format!("--install-dir=\"{}\"", install_dir.display()),
    ];
    if !desktop {
        args.push("--no-desktop".to_string());
    }
    if !context {
        args.push("--no-context".to_string());
    }
    if !launch {
        args.push("--no-launch".to_string());
    }
    let param_str = args.join(" ");

    let res = unsafe {
        ShellExecuteW(
            Some(HWND(hwnd_raw as *mut core::ffi::c_void)),
            w!("runas"),
            &HSTRING::from(self_exe.as_os_str()),
            &HSTRING::from(param_str),
            None,
            SW_SHOW,
        )
    };
    if res.0 as isize <= 32 {
        return Err("Administrator approval was cancelled or denied.".to_string());
    }
    Ok(())
}

#[cfg(windows)]
fn create_windows_shortcut(link_path: &Path, target_exe: &Path, work_dir: &Path) -> Result<(), String> {
    use windows::core::{Interface, HSTRING};
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoUninitialize, IPersistFile, CLSCTX_INPROC_SERVER,
        COINIT_APARTMENTTHREADED,
    };
    use windows::Win32::UI::Shell::{IShellLinkW, ShellLink};

    if let Some(parent) = link_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        let result: Result<(), String> = (|| {
            let link: IShellLinkW = CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER)
                .map_err(|e| format!("ShellLink COM error: {}", e))?;
            link.SetPath(&HSTRING::from(target_exe.as_os_str()))
                .map_err(|e| format!("SetPath error: {}", e))?;
            link.SetWorkingDirectory(&HSTRING::from(work_dir.as_os_str()))
                .map_err(|e| format!("SetWorkingDirectory error: {}", e))?;
            link.SetDescription(&HSTRING::from(
                "Compress I/O — Hybrid Media Compression Studio",
            ))
            .map_err(|e| format!("SetDescription error: {}", e))?;
            link.SetIconLocation(&HSTRING::from(target_exe.as_os_str()), 0)
                .map_err(|e| format!("SetIconLocation error: {}", e))?;

            let persist: IPersistFile = link
                .cast()
                .map_err(|e| format!("IPersistFile cast error: {}", e))?;
            persist
                .Save(&HSTRING::from(link_path.as_os_str()), true)
                .map_err(|e| format!("Shortcut save error: {}", e))?;
            Ok(())
        })();
        CoUninitialize();
        result
    }
}

fn register_explorer_context_menu(exe_path: &Path, enable: bool) {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let icon_val = format!("\"{}\",0", exe_path.display());
    let cmd_val = format!("\"{}\" \"%1\"", exe_path.display());

    for ext in CONTEXT_MENU_EXTENSIONS {
        let shell_subkey = format!(
            "Software\\Classes\\SystemFileAssociations\\{}\\shell\\CompressIO",
            ext
        );
        if enable {
            if let Ok((key, _)) = hkcu.create_subkey_with_flags(&shell_subkey, KEY_WRITE) {
                let _ = key.set_value("", &"Compress with Compress I/O");
                let _ = key.set_value("Icon", &icon_val);
                if let Ok((cmd_key, _)) = key.create_subkey_with_flags("command", KEY_WRITE) {
                    let _ = cmd_key.set_value("", &cmd_val);
                }
            }
        } else {
            let _ = hkcu.delete_subkey_all(&shell_subkey);
        }
    }
}

fn write_uninstall_registry(
    install_dir: &Path,
    exe_path: &Path,
    uninstaller_path: &Path,
) -> Result<(), String> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let uninst_subkey = format!(
        "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{}",
        PRODUCT_NAME
    );
    let (key, _) = hkcu
        .create_subkey_with_flags(&uninst_subkey, KEY_WRITE)
        .map_err(|e| format!("Registry error: {}", e))?;

    let size_kb = fs::metadata(exe_path)
        .map(|m| ((m.len() / 1024).max(1)) as u32)
        .unwrap_or(18000);

    let _ = key.set_value("DisplayName", &DISPLAY_NAME);
    let _ = key.set_value("DisplayVersion", &APP_VERSION);
    let _ = key.set_value("Publisher", &"Akshat Rawat");
    let _ = key.set_value("MainBinaryName", &MAIN_BIN_NAME);
    let _ = key.set_value("DisplayIcon", &format!("\"{}\"", exe_path.display()));
    let _ = key.set_value("InstallLocation", &format!("\"{}\"", install_dir.display()));
    let _ = key.set_value(
        "UninstallString",
        &format!("\"{}\" --uninstall", uninstaller_path.display()),
    );
    let _ = key.set_value("NoModify", &1u32);
    let _ = key.set_value("NoRepair", &1u32);
    let _ = key.set_value("EstimatedSize", &size_kb);

    let manu_subkey = format!("Software\\compress\\{}", PRODUCT_NAME);
    if let Ok((mkey, _)) = hkcu.create_subkey_with_flags(&manu_subkey, KEY_WRITE) {
        let _ = mkey.set_value("", &install_dir.to_string_lossy().to_string());
    }

    Ok(())
}

fn delete_uninstall_registry() {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let _ = hkcu.delete_subkey_all(format!(
        "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{}",
        PRODUCT_NAME
    ));
    let _ = hkcu.delete_subkey_all(format!("Software\\compress\\{}", PRODUCT_NAME));
}

fn safe_rel_path(raw: &Path) -> Option<PathBuf> {
    let mut clean = PathBuf::new();
    for comp in raw.components() {
        match comp {
            Component::Normal(p) => clean.push(p),
            Component::CurDir => {}
            _ => return None,
        }
    }
    if clean.as_os_str().is_empty() {
        None
    } else {
        Some(clean)
    }
}

fn restore_rollback(rollback_dir: &Path, install_dir: &Path, moved_rel_paths: &[PathBuf]) {
    for rel in moved_rel_paths {
        let dest = install_dir.join(rel);
        let backup = rollback_dir.join(rel);
        let _ = fs::remove_file(&dest);
        if backup.is_file() {
            if let Some(p) = dest.parent() {
                let _ = fs::create_dir_all(p);
            }
            let _ = fs::rename(&backup, &dest);
        }
    }
}

fn perform_install<F>(
    install_dir: &Path,
    desktop_shortcut: bool,
    context_menu: bool,
    launch_after: bool,
    report: F,
) -> Result<(), String>
where
    F: Fn(f64, &str),
{
    if EMBEDDED_BUNDLE_TAR_BR.is_empty() {
        return Err("Embedded application bundle is missing from this build.".to_string());
    }

    report(10.0, "CLOSING ACTIVE INSTANCES...");
    kill_running_app();

    fs::create_dir_all(install_dir)
        .map_err(|e| format!("Failed creating install folder: {}", e))?;

    let staging_dir = install_dir.join(".staging");
    let rollback_dir = install_dir.join(".rollback");
    let _ = fs::remove_dir_all(&staging_dir);
    let _ = fs::remove_dir_all(&rollback_dir);
    fs::create_dir_all(&staging_dir).map_err(|e| format!("Staging dir error: {}", e))?;
    fs::create_dir_all(&rollback_dir).map_err(|e| format!("Rollback dir error: {}", e))?;

    report(32.0, "UNPACKING VERIFIED PAYLOAD...");
    let mut extracted_rel_paths: Vec<PathBuf> = Vec::new();
    {
        let decompressor = brotli::Decompressor::new(Cursor::new(EMBEDDED_BUNDLE_TAR_BR), 65536);
        let mut archive = tar::Archive::new(decompressor);
        let entries = archive
            .entries()
            .map_err(|e| format!("Failed reading tar bundle: {}", e))?;

        for entry_res in entries {
            let mut entry = entry_res.map_err(|e| format!("Corrupt tar entry: {}", e))?;
            if entry.header().entry_type().is_dir() {
                continue;
            }
            let raw_path = entry
                .path()
                .map_err(|e| format!("Invalid archive path: {}", e))?;
            let Some(rel) = safe_rel_path(&raw_path) else {
                continue;
            };
            let stage_target = staging_dir.join(&rel);
            if let Some(p) = stage_target.parent() {
                fs::create_dir_all(p).map_err(|e| format!("Create dir failed: {}", e))?;
            }
            entry
                .unpack(&stage_target)
                .map_err(|e| format!("Unpack failed for {}: {}", rel.display(), e))?;
            extracted_rel_paths.push(rel);
        }
    }

    if extracted_rel_paths.is_empty() {
        let _ = fs::remove_dir_all(&staging_dir);
        let _ = fs::remove_dir_all(&rollback_dir);
        return Err("Bundle archive contained no installable files.".to_string());
    }

    report(62.0, "ATOMIC SWAP WITH ROLLBACK GUARD...");
    let mut swapped_rel_paths: Vec<PathBuf> = Vec::new();
    for rel in &extracted_rel_paths {
        let src = staging_dir.join(rel);
        let dest = install_dir.join(rel);
        let backup = rollback_dir.join(rel);

        if let Some(p) = dest.parent() {
            if let Err(e) = fs::create_dir_all(p) {
                restore_rollback(&rollback_dir, install_dir, &swapped_rel_paths);
                return Err(format!("Failed preparing folder: {}", e));
            }
        }

        if dest.exists() {
            if let Some(p) = backup.parent() {
                let _ = fs::create_dir_all(p);
            }
            let mut backed_up = false;
            for _ in 0..12 {
                if fs::rename(&dest, &backup).is_ok() {
                    backed_up = true;
                    break;
                }
                thread::sleep(Duration::from_millis(120));
            }
            if !backed_up {
                restore_rollback(&rollback_dir, install_dir, &swapped_rel_paths);
                return Err(format!("File locked by another process: {}", dest.display()));
            }
        }

        if let Err(e) = fs::rename(&src, &dest) {
            if backup.is_file() {
                let _ = fs::rename(&backup, &dest);
            }
            restore_rollback(&rollback_dir, install_dir, &swapped_rel_paths);
            return Err(format!("Failed installing {}: {}", rel.display(), e));
        }

        swapped_rel_paths.push(rel.clone());
    }

    let _ = fs::remove_dir_all(&staging_dir);
    let _ = fs::remove_dir_all(&rollback_dir);

    report(80.0, "CREATING SHORTCUTS & INTEGRATIONS...");
    let target_exe = install_dir.join(MAIN_BIN_NAME);
    let uninstaller_exe = install_dir.join("uninstall.exe");

    if let Ok(self_exe) = std::env::current_exe() {
        if self_exe != uninstaller_exe {
            let _ = fs::copy(&self_exe, &uninstaller_exe);
        }
    }

    let manifest = InstallManifest {
        version: APP_VERSION.to_string(),
        install_dir: install_dir.to_string_lossy().to_string(),
        files: extracted_rel_paths
            .iter()
            .map(|p| p.to_string_lossy().to_string())
            .collect(),
        desktop_shortcut,
        context_menu,
    };
    if let Ok(json) = serde_json::to_string_pretty(&manifest) {
        let _ = fs::write(install_dir.join(INSTALL_MANIFEST_NAME), json);
    }

    write_uninstall_registry(install_dir, &target_exe, &uninstaller_exe)?;

    cleanup_legacy_shortcuts();
    if let Some(sm_link) = start_menu_shortcut_path() {
        create_windows_shortcut(&sm_link, &target_exe, install_dir)?;
    }

    if desktop_shortcut {
        if let Some(dt_link) = desktop_shortcut_path() {
            create_windows_shortcut(&dt_link, &target_exe, install_dir)?;
        }
    } else if let Some(dt_link) = desktop_shortcut_path() {
        let _ = fs::remove_file(dt_link);
    }

    register_explorer_context_menu(&target_exe, context_menu);

    if launch_after && target_exe.is_file() {
        report(96.0, "LAUNCHING COMPRESS I/O...");
        Command::new(&target_exe)
            .current_dir(install_dir)
            .spawn()
            .map_err(|e| format!("Installed cleanly, but failed launching app: {}", e))?;
    }

    report(100.0, "COMPLETE");
    Ok(())
}

fn perform_uninstall<F>(remove_runtime_cache: bool, report: F) -> Result<(), String>
where
    F: Fn(f64, &str),
{
    report(18.0, "STOPPING COMPRESS I/O...");
    kill_running_app();

    report(42.0, "CLEANING EXPLORER, SHORTCUTS & REGISTRY...");
    register_explorer_context_menu(Path::new(""), false);
    cleanup_legacy_shortcuts();
    for maybe_path in [start_menu_shortcut_path(), desktop_shortcut_path()] {
        if let Some(p) = maybe_path {
            let _ = fs::remove_file(p);
        }
    }

    let (reg_dir, _) = read_existing_install_info();
    delete_uninstall_registry();

    let install_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()))
        .or(reg_dir)
        .or_else(|| default_install_dir().ok());

    report(74.0, "REMOVING TRACKED APPLICATION FILES...");
    if let Some(dir) = install_dir {
        let manifest_path = dir.join(INSTALL_MANIFEST_NAME);
        if let Ok(raw) = fs::read_to_string(&manifest_path) {
            if let Ok(manifest) = serde_json::from_str::<InstallManifest>(&raw) {
                for rel in manifest.files {
                    if let Some(safe) = safe_rel_path(Path::new(&rel)) {
                        let _ = fs::remove_file(dir.join(safe));
                    }
                }
            }
            let _ = fs::remove_file(&manifest_path);
        }
        let _ = fs::remove_file(dir.join(MAIN_BIN_NAME));

        if remove_runtime_cache {
            if let Some(rt) = runtime_data_dir() {
                let _ = fs::remove_dir_all(rt);
            }
        }

        let uninstaller = dir.join("uninstall.exe");
        let cmd_raw = format!(
            "/C ping -n 2 127.0.0.1 > nul & del /F /Q \"{}\" & rmdir \"{}\"",
            uninstaller.display(),
            dir.display()
        );
        let _ = Command::new("cmd")
            .current_dir(std::env::temp_dir())
            .raw_arg(&cmd_raw)
            .creation_flags(CREATE_NO_WINDOW)
            .spawn();
    }

    report(100.0, "UNINSTALLED");
    Ok(())
}

fn spawn_progress_emitter(proxy: EventLoopProxy<UserEvent>) -> impl Fn(f64, &str) {
    move |percent: f64, label: &str| {
        let _ = proxy.send_event(UserEvent::Progress {
            percent,
            label: label.to_string(),
        });
    }
}

fn main() {
    let opts = parse_cli_options();
    let (existing_dir, installed_version) = read_existing_install_info();

    let initial_dir = opts
        .custom_dir
        .clone()
        .map(|d| normalize_target_dir(&d))
        .or_else(|| existing_dir.clone())
        .or_else(|| default_install_dir().ok())
        .unwrap_or_else(|| PathBuf::from("%LOCALAPPDATA%\\compress-io"));

    if opts.is_silent {
        if opts.is_uninstall {
            let _ = perform_uninstall(false, |_, _| {});
        } else {
            let _ = perform_install(
                &initial_dir,
                opts.desktop_shortcut,
                opts.context_menu,
                opts.is_relaunch,
                |_, _| {},
            );
        }
        return;
    }

    let target_info = build_target_info(&initial_dir);
    let relation = compare_semver_relation(installed_version.as_deref(), APP_VERSION);
    let init_cfg = InitConfig {
        mode: if opts.is_uninstall { "uninstall" } else { "install" },
        version: APP_VERSION,
        installed_version,
        relation,
        install_dir: target_info.path,
        free_text: target_info.free_text,
        needs_elevation: target_info.needs_elevation,
        ffmpeg_cached: check_ffmpeg_cached(),
        auto_start: opts.auto_start,
        desktop_shortcut: opts.desktop_shortcut,
        context_menu: opts.context_menu,
        launch_after: opts.launch_after,
    };
    let init_script = format!(
        "window.__SETUP_CONFIG__ = {};",
        serde_json::to_string(&init_cfg).unwrap()
    );

    let event_loop = EventLoopBuilder::<UserEvent>::with_user_event().build();
    let proxy = event_loop.create_proxy();

    let window = WindowBuilder::new()
        .with_title(if opts.is_uninstall {
            "Uninstall Compress I/O"
        } else {
            "Compress I/O Setup"
        })
        .with_inner_size(LogicalSize::new(520.0, 480.0))
        .with_resizable(false)
        .with_decorations(false)
        .build(&event_loop)
        .expect("Failed creating installer window");

    let hwnd_raw = window.hwnd();
    #[cfg(windows)]
    apply_rounded_corners(hwnd_raw);

    let web_temp = std::env::temp_dir().join("compress-io-setup-webview");
    let _ = fs::create_dir_all(&web_temp);
    let mut web_context = WebContext::new(Some(web_temp));

    let ipc_proxy = proxy.clone();
    let webview_res = WebViewBuilder::new_with_web_context(&mut web_context)
        .with_html(EMBEDDED_UI_HTML)
        .with_initialization_script(&init_script)
        .with_ipc_handler(move |req| {
            let Ok(cmd) = serde_json::from_str::<IpcCommand>(req.body()) else {
                return;
            };
            match cmd {
                IpcCommand::Drag => {
                    let _ = ipc_proxy.send_event(UserEvent::Drag);
                }
                IpcCommand::Minimize => {
                    let _ = ipc_proxy.send_event(UserEvent::Minimize);
                }
                IpcCommand::Close => {
                    let _ = ipc_proxy.send_event(UserEvent::Exit);
                }
                IpcCommand::Browse { current_dir } => {
                    let _ = ipc_proxy.send_event(UserEvent::Browse(current_dir));
                }
                IpcCommand::Install {
                    install_dir,
                    desktop_shortcut,
                    context_menu,
                    launch_after,
                } => {
                    let dir = normalize_target_dir(Path::new(&install_dir));
                    if !can_write_to_dir(&dir) {
                        match relaunch_elevated_install(
                            hwnd_raw,
                            &dir,
                            desktop_shortcut,
                            context_menu,
                            launch_after,
                        ) {
                            Ok(()) => {
                                let _ = ipc_proxy.send_event(UserEvent::Exit);
                            }
                            Err(err) => {
                                let _ = ipc_proxy.send_event(UserEvent::Error(err));
                            }
                        }
                        return;
                    }

                    let p = ipc_proxy.clone();
                    thread::spawn(move || {
                        let reporter = spawn_progress_emitter(p.clone());
                        match perform_install(
                            &dir,
                            desktop_shortcut,
                            context_menu,
                            launch_after,
                            reporter,
                        ) {
                            Ok(()) => {
                                thread::sleep(Duration::from_millis(350));
                                let _ = p.send_event(UserEvent::Exit);
                            }
                            Err(err) => {
                                let _ = p.send_event(UserEvent::Error(err));
                            }
                        }
                    });
                }
                IpcCommand::Uninstall {
                    remove_runtime_cache,
                } => {
                    let p = ipc_proxy.clone();
                    thread::spawn(move || {
                        let reporter = spawn_progress_emitter(p.clone());
                        match perform_uninstall(remove_runtime_cache, reporter) {
                            Ok(()) => {
                                thread::sleep(Duration::from_millis(350));
                                let _ = p.send_event(UserEvent::Exit);
                            }
                            Err(err) => {
                                let _ = p.send_event(UserEvent::Error(err));
                            }
                        }
                    });
                }
            }
        })
        .build(&window);

    let webview = match webview_res {
        Ok(wv) => wv,
        Err(_) => {
            if opts.is_uninstall {
                let _ = perform_uninstall(false, |_, _| {});
            } else {
                let _ = perform_install(
                    &initial_dir,
                    opts.desktop_shortcut,
                    opts.context_menu,
                    opts.launch_after,
                    |_, _| {},
                );
            }
            return;
        }
    };

    event_loop.run(move |event, _, control_flow| {
        *control_flow = ControlFlow::Wait;
        match event {
            Event::WindowEvent {
                event: WindowEvent::CloseRequested,
                ..
            } => {
                *control_flow = ControlFlow::Exit;
            }
            Event::UserEvent(UserEvent::Exit) => {
                *control_flow = ControlFlow::Exit;
            }
            Event::UserEvent(UserEvent::Drag) => {
                let _ = window.drag_window();
            }
            Event::UserEvent(UserEvent::Minimize) => {
                window.set_minimized(true);
            }
            Event::UserEvent(UserEvent::Browse(current)) => {
                #[cfg(windows)]
                if let Some(chosen) = pick_install_folder(hwnd_raw, &current) {
                    let normalized = normalize_target_dir(&chosen);
                    let info = build_target_info(&normalized);
                    let json = serde_json::to_string(&info).unwrap();
                    let _ = webview.evaluate_script(&format!("window.__onTargetChanged({});", json));
                }
            }
            Event::UserEvent(UserEvent::Progress { percent, label }) => {
                let json = serde_json::to_string(&ProgressPayload { percent, label }).unwrap();
                let _ = webview.evaluate_script(&format!("window.__onSetupProgress({});", json));
            }
            Event::UserEvent(UserEvent::Error(msg)) => {
                let json = serde_json::to_string(&msg).unwrap();
                let _ = webview.evaluate_script(&format!("window.__onSetupError({});", json));
            }
            _ => {}
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_updater_uninstall_and_custom_dir_flags() {
        let opts = parse_cli_args(["/s", "/UPDATE", "/R", "/D=D:\\Apps\\Compress IO"]);
        assert!(opts.is_silent);
        assert!(opts.is_relaunch);
        assert!(!opts.is_uninstall);
        assert_eq!(opts.custom_dir, Some(PathBuf::from("D:\\Apps\\Compress IO")));

        let auto = parse_cli_args([
            "--auto",
            "--install-dir=\"C:\\Program Files\\compress-io\"",
            "--no-desktop",
            "--no-context",
        ]);
        assert!(auto.auto_start);
        assert!(!auto.desktop_shortcut);
        assert!(!auto.context_menu);
        assert_eq!(
            auto.custom_dir,
            Some(PathBuf::from("C:\\Program Files\\compress-io"))
        );
    }

    #[test]
    fn normalizes_custom_directories_and_prevents_traversal() {
        assert_eq!(
            normalize_target_dir(Path::new("D:\\Apps")),
            PathBuf::from("D:\\Apps\\compress-io")
        );
        assert_eq!(
            normalize_target_dir(Path::new("D:\\Apps\\compress-io")),
            PathBuf::from("D:\\Apps\\compress-io")
        );
        assert!(safe_rel_path(Path::new("../evil.exe")).is_none());
        assert_eq!(
            safe_rel_path(Path::new("./universal-compressor.exe")),
            Some(PathBuf::from("universal-compressor.exe"))
        );
    }

    #[test]
    fn compares_semver_relations_accurately() {
        assert_eq!(compare_semver_relation(None, "0.1.60"), "fresh");
        assert_eq!(compare_semver_relation(Some("0.1.59"), "0.1.60"), "upgrade");
        assert_eq!(compare_semver_relation(Some("0.1.60"), "0.1.60"), "reinstall");
        assert_eq!(compare_semver_relation(Some("0.2.0"), "0.1.60"), "downgrade");
    }

    #[test]
    fn embeds_non_empty_ui_html_and_paths() {
        assert!(EMBEDDED_UI_HTML.contains("Compress"));
        assert!(EMBEDDED_UI_HTML.contains("Install Location"));
        assert!(default_install_dir().unwrap().ends_with("compress-io"));
        let dt = desktop_shortcut_path().unwrap();
        let sm = start_menu_shortcut_path().unwrap();
        assert_eq!(dt.file_name().and_then(|s| s.to_str()), Some("Compress IO.lnk"));
        assert_eq!(sm.file_name().and_then(|s| s.to_str()), Some("Compress IO.lnk"));
        assert!(!SHORTCUT_NAME.contains('/') && !SHORTCUT_NAME.contains('\\'));
    }

    #[test]
    fn cleans_broken_slash_shortcut_folder() {
        let temp = std::env::temp_dir().join(format!(
            "compress_io_shortcut_test_{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let broken_dir = temp.join("Compress I");
        fs::create_dir_all(&broken_dir).unwrap();
        fs::write(broken_dir.join("O.lnk"), b"lnk").unwrap();

        remove_broken_slash_shortcut(Some(temp.clone()));
        assert!(!broken_dir.exists());

        let _ = fs::remove_dir_all(&temp);
    }
}
