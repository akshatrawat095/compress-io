use std::env;
use std::fs::{self, File};
use std::path::PathBuf;

fn read_tauri_version() -> String {
    let conf_path = PathBuf::from("../tauri.conf.json");
    if let Ok(raw) = fs::read_to_string(&conf_path) {
        println!("cargo:rerun-if-changed={}", conf_path.display());
        for line in raw.lines() {
            let trimmed = line.trim();
            if let Some(rest) = trimmed.strip_prefix("\"version\":") {
                let v = rest.trim().trim_end_matches(',').trim().trim_matches('"');
                if !v.is_empty() {
                    return v.to_string();
                }
            }
        }
    }
    env::var("CARGO_PKG_VERSION").unwrap_or_else(|_| "0.1.61".to_string())
}

fn main() {
    let version = read_tauri_version();
    println!("cargo:rustc-env=COMPRESS_IO_VERSION={}", version);

    let out_dir = PathBuf::from(env::var("OUT_DIR").expect("OUT_DIR missing"));
    let compressed_out = out_dir.join("app_bundle.tar.br");

    let payload_path = env::var("COMPRESS_IO_PAYLOAD")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("../target/release/universal-compressor.exe"));

    println!("cargo:rerun-if-changed=build.rs");
    println!("cargo:rerun-if-changed=src/ui.html");
    println!("cargo:rerun-if-changed=../icons/icon.ico");
    println!("cargo:rerun-if-env-changed=COMPRESS_IO_PAYLOAD");
    println!("cargo:rerun-if-env-changed=COMPRESS_IO_EXTRA_DIR");
    println!("cargo:rerun-if-changed={}", payload_path.display());

    if payload_path.is_file() {
        let dst = File::create(&compressed_out).expect("Failed creating compressed bundle");
        let encoder = brotli::CompressorWriter::new(dst, 65536, 9, 22);
        let mut tar_builder = tar::Builder::new(encoder);

        tar_builder
            .append_path_with_name(&payload_path, "universal-compressor.exe")
            .expect("Failed archiving app executable");

        if let Ok(extra) = env::var("COMPRESS_IO_EXTRA_DIR") {
            let extra_path = PathBuf::from(extra);
            if extra_path.is_dir() {
                tar_builder
                    .append_dir_all(".", &extra_path)
                    .expect("Failed archiving extra bundle assets");
            }
        }

        let encoder = tar_builder.into_inner().expect("Failed finalizing tar bundle");
        drop(encoder);
    } else if env::var("COMPRESS_IO_ALLOW_EMPTY_PAYLOAD").is_ok() {
        fs::write(&compressed_out, b"").expect("Failed creating placeholder bundle");
    } else {
        panic!(
            "Release payload not found at '{}'. Build the main app binary first (tauri build).",
            payload_path.display()
        );
    }

    if env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") {
        let mut res = tauri_winres::WindowsResource::new();
        res.set_icon("../icons/icon.ico");
        res.set("ProductName", "Compress I/O Setup");
        res.set("FileDescription", "Compress I/O Windows Installer");
        res.set("CompanyName", "Akshat Rawat");
        res.set("FileVersion", &version);
        res.set("ProductVersion", &version);
        res.set_manifest(
            r#"<assembly xmlns="urn:schemas-microsoft-com:asm.v1" manifestVersion="1.0" xmlns:asmv3="urn:schemas-microsoft-com:asm.v3">
  <asmv3:application>
    <asmv3:windowsSettings>
      <dpiAwareness xmlns="http://schemas.microsoft.com/SMI/2016/WindowsSettings">PerMonitorV2</dpiAwareness>
    </asmv3:windowsSettings>
  </asmv3:application>
</assembly>"#,
        );
        res.compile().expect("Failed compiling Windows resources");
    }
}
