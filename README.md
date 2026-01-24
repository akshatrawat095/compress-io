# 🚀 Compress I/O
### The Universal, Privacy-Focused Media Compressor.
> **Maintained by:** [Akshat Rawat](https://github.com/akshatrawat095)  
> **Repository:** [github.com/akshatrawat095/compress-io](https://github.com/akshatrawat095/compress-io)

![Downloads](https://img.shields.io/github/downloads/akshatrawat095/compress-io/total?style=for-the-badge&color=blue)
![Version](https://img.shields.io/github/v/release/akshatrawat095/compress-io?style=for-the-badge&color=green)
![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20Mac%20%7C%20Linux-lightgrey?style=for-the-badge)

**Compress I/O** is a lightning-fast, offline media compressor built with **Tauri, Rust, and React**. It uses your computer's dedicated hardware (GPU) to shrink video and image files without losing quality.

Unlike online converters, **your files never leave your device.**

---

## ✨ Key Features

### ⚡ Universal GPU Acceleration
Automatically detects and uses your hardware for maximum speed.
* ✅ **NVIDIA:** NVENC (RTX/GTX support)
* ✅ **AMD:** AMF (Radeon support)
* ✅ **Intel:** QuickSync (UHD/Iris/Arc support)
* ✅ **Apple:** VideoToolbox (M1/M2/M3 & Intel Mac support)

### 🛡️ Hybrid Engine (Crash-Proof)
Uses a smart **"Hybrid Mode"** (CPU Reads → GPU Writes) to ensure stability even on massive 8K files or corrupted inputs.

### 🎬 Universal Playback Fix
Automatically standardizes video pixel formats (`yuv420p`), ensuring your compressed videos play perfectly on:
* Windows Media Player / QuickTime
* Smart TVs & Consoles
* iPhones & Android devices

### 🔒 100% Offline & Private
No cloud uploads. No file size limits. No watermarks. Your data stays on your machine.

---

## 📂 Supported Formats

| Type | Formats Supported | Engine Used |
| :--- | :--- | :--- |
| **Standard Video** | `.mp4`, `.mkv`, `.mov`, `.avi`, `.flv`, `.wmv` | **GPU Hardware** (NVIDIA/AMD/Intel/Mac) |
| **Web Video** | `.webm` (VP9), `.ogg`, `.ogv` | High-Quality Software Encoder |
| **Animation** | `.gif` | Palette-Optimized FFmpeg Filter |
| **Images** | `.jpg`, `.png`, `.webp`, `.bmp`, `.tiff` | Lossless/Lossy Optimization |

---

## 🚀 Installation

1.  Go to the [**Releases Page**](https://github.com/akshatrawat095/compress-io/releases).
2.  Download the installer for your system:
    * **Windows:** `Compress-IO_x64-setup.exe`
    * **Mac:** `Compress-IO_aarch64.dmg` (M1/M2) or `_x64.dmg` (Intel)
3.  Run the installer and start compressing!

---

## 🛠️ Tech Stack

* **Frontend:** React + Vite (Fast, modern UI)
* **Backend:** Rust (Tauri) (Secure, native performance)
* **Engine:** FFmpeg (Static, custom build)

---

## ❓ FAQ / Troubleshooting

**Q: Why does Task Manager show 0% GPU usage?**
* **A:** Windows Task Manager often hides the "Video Encode" graph. Switch the graph from "3D" to "Video Encode" to see the work happening.
* *Note: On laptops, ensure you plug in your charger for maximum GPU speed.*

**Q: My 4K video size didn't drop significantly. Why?**
* **A:** The app prioritizes **Quality** and **Compatibility**. If your input was already highly compressed (H.265), the app converts it to the more compatible H.264 format while maintaining visual fidelity, which limits size reduction.

---

## 👨‍💻 Development

Want to build it yourself?

```bash
# 1. Clone the repo
git clone [https://github.com/akshatrawat095/compress-io.git](https://github.com/akshatrawat095/compress-io.git)

# 2. Install dependencies
npm install

# 3. Run in Development Mode
npm run tauri dev

# 4. Build for Release
npm run tauri build

📬 Contact
If you have issues or feature requests, feel free to reach out!
 * Email: akshatrawat095@gmail.com
 * X (Twitter): @AkshatRawat20
 * Instagram: @akshatrawat095

