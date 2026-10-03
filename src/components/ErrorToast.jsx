import React, { useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence, useMotionValue, useSpring, useMotionTemplate } from 'framer-motion';

// ── Intelligent error message parsing ──
// Every error from the Rust backend is matched against known patterns.
// Each pattern provides:
//   - title: Short uppercase label for the error category
//   - desc: Plain-English explanation anyone can understand
//   - technical: Developer-oriented explanation with proper terminology
//   - suggestion: Actionable fix the user can apply immediately
//   - icon: Visual category for the animated SVG icon
function parseError(raw) {
  const str = typeof raw === 'string' ? raw : String(raw);

  const patterns = [
    // ─── FORMAT & CODEC ERRORS ───
    {
      match: /target size requires a lossy format/i,
      title: "FORMAT MISMATCH",
      desc: "Your file is in a lossless format (like PNG) which keeps every pixel perfect — but that means it can't be squeezed down to a specific file size. Lossy formats like JPG or WebP throw away tiny details your eyes won't notice, allowing real compression.",
      technical: "Lossless codecs (PNG/DEFLATE, BMP, TIFF/LZW) use entropy encoding that preserves all source data. Target-size compression requires a lossy transform (DCT for JPEG, VP8 for WebP) with an adjustable quantization parameter (q-value) to iteratively converge on the desired byte budget via binary search.",
      suggestion: "Change the Output Format dropdown from \"Same as Input\" to JPG or WebP, then retry.",
      icon: "format"
    },
    {
      match: /cannot compress to this target size without reducing dimensions/i,
      title: "TARGET TOO SMALL",
      desc: "Even at the lowest possible quality, your image is still larger than the target size you set. The image has too many pixels to fit into that small of a file.",
      technical: "The binary search over the quantization parameter (q:v) has exhausted the full range (q=31 for MJPEG, q=100→1 for libwebp) without reaching the target byte budget. The spatial resolution (width × height) of the source exceeds what the codec can encode within the constraint at any quality level.",
      suggestion: "Either increase the target file size, or set smaller Width/Height dimensions in the settings to downscale the image first.",
      icon: "format"
    },

    // ─── GPU / HARDWARE ACCELERATION ERRORS ───
    {
      match: /gpu encode failed.*code\s*(\d+)/i,
      title: "GPU ENCODE FAILED",
      desc: "Your graphics card tried to handle the processing but ran into a problem. This can happen if your GPU drivers are outdated, or if the GPU doesn't support the required encoding features.",
      technical: "Hardware-accelerated encoding via the GPU (NVENC/AMF/QSV) returned a non-zero exit code. This typically indicates a VRAM allocation failure, unsupported codec profile on the hardware encoder, or a driver-level incompatibility. The FFmpeg process was invoked with -hwaccel auto and GPU-specific encoder flags.",
      suggestion: "Toggle off the GPU Acceleration switch and retry — the CPU encoder is slower but universally compatible. If this persists, update your GPU drivers.",
      icon: "gpu"
    },

    // ─── AI ENGINE ERRORS ───
    {
      match: /ai engine not found/i,
      title: "AI ENGINE MISSING",
      desc: "The AI upscaling/enhancement engine wasn't found on your system. It may not have been installed correctly, or the app files are incomplete.",
      technical: "The sidecar binary for the AI inference engine (Real-ESRGAN / RIFE) was not located at the expected resource_dir path. This is typically a packaging issue where the bundled executable was not included in the Tauri resource directory, or the binary was quarantined by antivirus software.",
      suggestion: "Reinstall the app to restore the AI engine files. If you have antivirus software, whitelist the app's installation directory.",
      icon: "engine"
    },
    {
      match: /ai engine error.*process exited with code/i,
      title: "AI PROCESSING FAILED",
      desc: "The AI engine started but crashed during processing. This usually happens when your system doesn't have enough memory (RAM or VRAM) to handle the file at the current settings.",
      technical: "The AI inference subprocess (Real-ESRGAN / RIFE) terminated with a non-zero exit code. Common causes: insufficient VRAM for the tile size, unsupported GPU architecture (pre-Vulkan), corrupted model weights, or OOM (Out of Memory) on large input tensors. The engine uses ncnn/Vulkan for GPU inference.",
      suggestion: "Try reducing the Tile Size in settings (e.g., 128 or 64), or lower the AI Scale factor. If on integrated graphics, expect slower processing.",
      icon: "engine"
    },
    {
      match: /failed to spawn ai/i,
      title: "AI LAUNCH FAILED",
      desc: "The app tried to start the AI engine but your operating system blocked it. This is often caused by antivirus software or missing system permissions.",
      technical: "std::process::Command::spawn() failed for the AI sidecar binary. The OS returned a permission denied or file-not-found error. On Windows, SmartScreen or Defender may quarantine unsigned executables. On macOS, Gatekeeper may block the binary without an ad-hoc signature.",
      suggestion: "Check if your antivirus quarantined any files in the app directory. On Windows, try running as Administrator.",
      icon: "engine"
    },

    // ─── VIDEO-SPECIFIC ERRORS ───
    {
      match: /could not determine video duration/i,
      title: "DURATION UNKNOWN",
      desc: "The app couldn't figure out how long your video is, which is needed to calculate the right bitrate for your target file size. The video file might be damaged or in an unusual format.",
      technical: "FFprobe/FFmpeg stderr parsing failed to extract the 'Duration: HH:MM:SS.ms' field from the container metadata. This occurs when the media container (MP4/MKV/AVI) lacks a valid moov atom (MP4), seekhead (MKV), or has a corrupted header. Variable-bitrate streams without a duration index also trigger this.",
      suggestion: "Try remuxing the video first (e.g., with another tool like HandBrake or VLC), then retry. If the file plays fine in a player, it may just have missing metadata.",
      icon: "engine"
    },
    {
      match: /target size is too small for this video/i,
      title: "TARGET TOO SMALL",
      desc: "The target file size you set is mathematically impossible for a video this long. Even at the lowest quality, the video can't fit in that small a file.",
      technical: "Calculated target bitrate = (targetBytes × 8) / duration_seconds. The resulting bitrate is below the codec's minimum viable bitrate floor (typically ~50kbps for H.264/H.265). At bitrates this low, the encoder cannot produce valid NAL units and will either produce unwatchable artifacts or fail entirely.",
      suggestion: "Increase the target file size, or trim the video to a shorter duration before compressing.",
      icon: "format"
    },
    {
      match: /pass 1 failed.*code\s*(\d+)/i,
      title: "ENCODE PASS 1 FAILED",
      desc: "The first analysis pass of two-pass encoding failed. Two-pass encoding analyzes the video first, then compresses — but the analysis step crashed.",
      technical: "FFmpeg's first pass (-pass 1) with -f null output failed. Pass 1 generates a log file (ffmpeg2pass-*.log) containing frame-by-frame complexity statistics used for optimal bitrate distribution in pass 2. Failure typically indicates an unsupported pixel format, codec incompatibility, or corrupted input stream.",
      suggestion: "Try disabling GPU acceleration, or convert the video to MP4 first using a different tool.",
      icon: "engine"
    },
    {
      match: /pass 2 failed.*code\s*(\d+)/i,
      title: "ENCODE PASS 2 FAILED",
      desc: "The second encoding pass failed. The first pass (analysis) completed, but the actual compression step crashed. This is usually a codec or memory issue.",
      technical: "FFmpeg's second pass (-pass 2) failed during the actual encode. It expected the pass-1 log file for bitrate allocation but either the log was corrupted, the codec parameters were incompatible, or the system ran out of memory during frame encoding. The target bitrate calculated from the two-pass budget may also be below the encoder's minimum.",
      suggestion: "Try a slightly larger target file size, disable GPU acceleration, or close other memory-heavy apps.",
      icon: "engine"
    },
    {
      match: /failed to stitch final video/i,
      title: "STITCH FAILED",
      desc: "All the enhanced video frames were processed successfully, but combining them back into a single video file failed.",
      technical: "FFmpeg's image-sequence-to-video muxing step failed. The concat/stitch operation uses -framerate with -i pattern (e.g., frame_%08d.png) to reassemble enhanced frames into a container (MP4/MKV). Failure causes: missing frames in sequence, incompatible pixel format (yuv420p vs yuv444p), or disk space exhaustion during muxing.",
      suggestion: "Check that you have enough free disk space (at least 2× the original video size), then retry.",
      icon: "engine"
    },
    {
      match: /gif error/i,
      title: "GIF ERROR",
      desc: "Something went wrong while creating or processing the GIF. GIFs are limited to 256 colors and can be tricky to compress.",
      technical: "FFmpeg's GIF encoding pipeline (using split/palettegen/paletteuse filter chain) returned a non-zero exit code. GIF encoding requires a two-step filter graph: first generating an optimal 256-color palette, then applying it via dithering (floyd_steinberg/bayer). Failures often occur with unusual input resolutions or very high frame counts.",
      suggestion: "Try reducing the dimensions or converting to MP4/WebP instead — they handle animations much better than GIF.",
      icon: "engine"
    },

    // ─── FILE SYSTEM & I/O ERRORS ───
    {
      match: /input file not found/i,
      title: "FILE NOT FOUND",
      desc: "The file you added no longer exists at its original location. It may have been moved, renamed, or deleted since you added it to the queue.",
      technical: "Path::exists() returned false for the input file path. The inode/file-handle is no longer valid on the filesystem. This is a race condition between the time the file was enqueued (via drag-drop or file picker) and the time processing started. On network drives, this can also indicate a dropped SMB/NFS connection.",
      suggestion: "Remove the file from the queue, re-add it from its current location, and try again.",
      icon: "missing"
    },
    {
      match: /security error.*path traversal/i,
      title: "SECURITY BLOCKED",
      desc: "The file path you provided looks suspicious — it contains patterns that could be used to access files outside the allowed directories. The app blocked this for your safety.",
      technical: "The path normalization check detected directory traversal sequences (../ or ..\\ ) in the supplied file path. This is a security mitigation against path traversal attacks (CWE-22) that could allow arbitrary file reads outside the application's sandboxed scope. Tauri's allowlist may also restrict access.",
      suggestion: "Move the file to a normal folder (like Desktop or Documents) and try again. Avoid paths with '..' in them.",
      icon: "missing"
    },
    {
      match: /security error.*only absolute paths/i,
      title: "INVALID PATH",
      desc: "The app only accepts full file paths (like C:\\Users\\...\\file.mp4) for security reasons, but received a relative path instead.",
      technical: "The path validation check rejected a relative path. The application enforces absolute/canonical paths to prevent ambiguity in file resolution and to work correctly with Tauri's filesystem scope. Relative paths could resolve differently depending on the CWD of the sidecar process vs. the main process.",
      suggestion: "This is likely a bug — try removing and re-adding the file. If it persists, restart the app.",
      icon: "missing"
    },

    // ─── PREVIEW ERRORS ───
    {
      match: /could not load preview/i,
      title: "PREVIEW FAILED",
      desc: "The app couldn't generate a before/after comparison preview. The output file might be corrupted or in a format the preview can't display.",
      technical: "invoke('read_file_bytes') failed for either the original or processed file path. The binary data couldn't be read into a Uint8Array and converted to a Blob URL for the <img> element. Possible causes: the output file was not fully flushed to disk, the codec produced a non-standard byte stream, or the file handle is locked by another process.",
      suggestion: "Close the modal and try opening the file directly from its saved location to verify it was processed correctly.",
      icon: "preview"
    },

    // ─── SIDECAR / FFMPEG CORE ERRORS ───
    {
      match: /failed to find ffmpeg/i,
      title: "FFMPEG MISSING",
      desc: "The core processing engine (FFmpeg) wasn't found. The app needs this to compress and convert media files. It should come bundled with the app.",
      technical: "app.shell().sidecar('ffmpeg') failed to locate the FFmpeg binary in the Tauri sidecar directory. Sidecar binaries are expected in src-tauri/binaries/ at build time and are resolved at runtime via the resource_dir. This indicates a broken installation or the binary was removed/quarantined post-install.",
      suggestion: "Reinstall the app. If you have antivirus software, add an exception for the app's installation folder.",
      icon: "engine"
    },
    {
      match: /failed to run ffmpeg/i,
      title: "FFMPEG CRASHED",
      desc: "The processing engine (FFmpeg) was found but crashed when trying to run. This might be a permissions issue or a conflict with other software.",
      technical: "The FFmpeg sidecar process was successfully located but Command::output() returned an error. The process either failed to spawn (permission denied, binary corrupted) or was killed by the OS (signal 9/SIGKILL from OOM killer on Linux, or terminated by antivirus on Windows).",
      suggestion: "Try running the app as Administrator. Check Task Manager for any processes blocking FFmpeg.",
      icon: "engine"
    },
    {
      match: /failed to spawn turbo lane/i,
      title: "TURBO LANE FAILED",
      desc: "The app tried to run multiple AI enhancement threads in parallel to speed things up, but one of the parallel workers failed to start.",
      technical: "Multi-threaded AI inference spawning failed. The app splits input frames into chunks and spawns N parallel Real-ESRGAN/RIFE processes (Turbo Lanes) for concurrent processing. Command::spawn() failed for one lane, typically due to VRAM exhaustion (each lane allocates its own GPU memory), file handle limits, or process count limits.",
      suggestion: "Reduce the number of parallel lanes or close other GPU-heavy applications (games, browsers with hardware acceleration).",
      icon: "engine"
    },
    {
      match: /error.*code\s*(\d+)/i,
      title: "PROCESS ERROR",
      desc: "The media processing engine exited with an error. This is a general failure that can happen with unusual file formats, corrupted files, or unsupported codecs.",
      technical: "FFmpeg/sidecar process terminated with a non-zero exit code, indicating an unhandled error in the encoding/decoding pipeline. The stderr output (captured as last_log_error) may contain more specific information about the failure point in the filter graph or codec initialization.",
      suggestion: "Check the Technical Details below for the specific error message. Try converting your file to a standard format (MP4/H.264 for video, JPG for images) first.",
      icon: "engine"
    },

    // ─── GENERIC SIDECAR / SYSTEM ERRORS ───
    {
      match: /sidecar/i,
      title: "SIDECAR ERROR",
      desc: "A helper process that the app depends on couldn't be started or communicate properly. This is usually an installation or permissions issue.",
      technical: "Tauri's sidecar system (app.shell().sidecar()) failed. Sidecars are external binaries bundled with the Tauri app that run as child processes. The failure could be at resolution (binary not found), spawning (OS permission denied), or communication (IPC pipe broken). Check that the binary exists in the app's resource directory and has execute permissions.",
      suggestion: "Reinstall the app. On Windows, try running as Administrator. On macOS, you may need to allow the app in System Preferences → Security.",
      icon: "engine"
    },
    {
      match: /wait failed/i,
      title: "PROCESS INTERRUPTED",
      desc: "The app was waiting for a processing task to finish, but the task was interrupted unexpectedly — possibly by a system event or resource limit.",
      technical: "child.wait() returned an error, meaning the OS could not report the exit status of the spawned subprocess. This can occur if the child process was killed by an external signal (SIGKILL), the parent lost its handle to the child, or the system ran out of PIDs. On Windows, WaitForSingleObject may fail if the handle was invalidated.",
      suggestion: "Close unnecessary applications to free system resources, then retry.",
      icon: "engine"
    }
  ];

  for (const p of patterns) {
    if (p.match.test(str)) return { ...p, raw: str };
  }

  return {
    title: "UNEXPECTED ERROR",
    desc: "Something went wrong that the app didn't anticipate. The raw error details below might help identify the issue.",
    technical: "An unmatched error string was thrown from either the Tauri IPC layer (invoke()) or an unhandled Rust Result::Err propagation. The error did not match any known pattern in the frontend error parser.",
    suggestion: "Try restarting the app. If this keeps happening, take a screenshot and report it as a bug.",
    icon: "generic",
    raw: str
  };
}

// ── Glitch text effect ──
function GlitchText({ text, className }) {
  return (
    <span className={`relative inline-block ${className}`}>
      <motion.span
        className="absolute inset-0 text-red-500 opacity-0"
        style={{ clipPath: 'inset(0 0 65% 0)' }}
        animate={{
          opacity: [0, 0.8, 0, 0.6, 0],
          x: [-2, 2, -1, 0],
        }}
        transition={{ duration: 0.3, repeat: 2, repeatDelay: 2 }}
      >
        {text}
      </motion.span>
      <motion.span
        className="absolute inset-0 text-cyan-400 opacity-0"
        style={{ clipPath: 'inset(65% 0 0 0)' }}
        animate={{
          opacity: [0, 0.6, 0, 0.5, 0],
          x: [2, -2, 1, 0],
        }}
        transition={{ duration: 0.3, repeat: 2, repeatDelay: 2.5 }}
      >
        {text}
      </motion.span>
      <span className="relative z-10">{text}</span>
    </span>
  );
}

// ── Animated error icon ──
function ErrorIcon({ type, isDarkMode }) {
  return (
    <motion.div
      initial={{ scale: 0, rotate: -180 }}
      animate={{ scale: 1, rotate: 0 }}
      transition={{ type: "spring", stiffness: 400, damping: 15, delay: 0.1 }}
      className="relative"
    >
      {/* Pulsing ring */}
      <motion.div
        className="absolute inset-0 rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(239,68,68,0.4) 0%, transparent 70%)',
        }}
        animate={{ scale: [1, 1.8, 1], opacity: [0.6, 0, 0.6] }}
        transition={{ duration: 2, repeat: Infinity }}
      />

      {/* Icon circle */}
      <div className="relative w-14 h-14 rounded-full bg-gradient-to-br from-red-500 via-rose-500 to-orange-500 flex items-center justify-center shadow-lg shadow-red-500/40">
        <motion.svg
          viewBox="0 0 24 24"
          className="w-7 h-7 text-white"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {type === "format" && (
            <>
              <motion.path
                d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"
                initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
                transition={{ duration: 0.6, delay: 0.2 }}
              />
              <motion.polyline
                points="14 2 14 8 20 8"
                initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
                transition={{ duration: 0.4, delay: 0.5 }}
              />
              <motion.path
                d="M9 15l2 2 4-4"
                initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
                transition={{ duration: 0.5, delay: 0.6 }}
                stroke="currentColor"
                strokeWidth={2.5}
              />
            </>
          )}
          {type === "gpu" && (
            <>
              <motion.rect width="16" height="16" x="4" y="4" rx="2"
                initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
                transition={{ duration: 0.6, delay: 0.2 }}
              />
              <motion.path d="M9 9h6v6H9zM15 2v2M15 20v2M2 15h2M20 15h2M2 9h2M20 9h2M9 2v2M9 20v2"
                initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
                transition={{ duration: 0.6, delay: 0.4 }}
              />
            </>
          )}
          {type === "missing" && (
            <>
              <motion.path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"
                initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
                transition={{ duration: 0.6, delay: 0.2 }}
              />
              <motion.path d="M13 2v7h7"
                initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
                transition={{ duration: 0.4, delay: 0.5 }}
              />
              <motion.path d="M10 15l4-4M14 15l-4-4"
                initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
                transition={{ duration: 0.3, delay: 0.6 }}
                strokeWidth={2.5}
              />
            </>
          )}
          {(type === "generic" || type === "engine" || type === "preview") && (
            <>
              <motion.path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
                initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
                transition={{ duration: 0.6, delay: 0.2 }}
              />
              <motion.line x1="12" y1="9" x2="12" y2="13"
                initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
                transition={{ duration: 0.3, delay: 0.5 }}
              />
              <motion.line x1="12" y1="17" x2="12.01" y2="17"
                initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
                transition={{ duration: 0.2, delay: 0.7 }}
              />
            </>
          )}
        </motion.svg>
      </div>
    </motion.div>
  );
}

// ── Particle explosion on mount ──
function ParticleBurst() {
  const particles = Array.from({ length: 12 }, (_, i) => {
    const angle = (i / 12) * Math.PI * 2;
    const distance = 40 + Math.random() * 30;
    return {
      x: Math.cos(angle) * distance,
      y: Math.sin(angle) * distance,
      size: 2 + Math.random() * 3,
      delay: Math.random() * 0.2,
      color: ['#ef4444', '#f97316', '#fb923c', '#fbbf24', '#f43f5e'][Math.floor(Math.random() * 5)]
    };
  });

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {particles.map((p, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full"
          style={{
            width: p.size, height: p.size,
            background: p.color,
            left: '50%', top: '40%',
            boxShadow: `0 0 6px ${p.color}`
          }}
          initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
          animate={{ x: p.x, y: p.y, opacity: 0, scale: 0 }}
          transition={{ duration: 0.6, delay: p.delay, ease: "easeOut" }}
        />
      ))}
    </div>
  );
}

// ── Scanning line effect ──
function ScanLine({ isDarkMode }) {
  return (
    <motion.div
      className="absolute left-0 right-0 h-[1px] pointer-events-none z-20"
      style={{
        background: `linear-gradient(90deg, transparent, ${isDarkMode ? 'rgba(239,68,68,0.4)' : 'rgba(239,68,68,0.2)'}, transparent)`,
      }}
      initial={{ top: '0%' }}
      animate={{ top: ['0%', '100%', '0%'] }}
      transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
    />
  );
}

// ── Main ErrorToast Component ──
export default function ErrorToast({ error, isDarkMode, onDismiss }) {
  const cardRef = useRef(null);
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const handleMouseMove = useCallback((e) => {
    if (!cardRef.current) return;
    const { left, top } = cardRef.current.getBoundingClientRect();
    mouseX.set(e.clientX - left);
    mouseY.set(e.clientY - top);
  }, [mouseX, mouseY]);

  const springX = useSpring(mouseX, { stiffness: 500, damping: 50 });
  const springY = useSpring(mouseY, { stiffness: 500, damping: 50 });

  const spotlightColor = isDarkMode ? 'rgba(239, 68, 68, 0.12)' : 'rgba(239, 68, 68, 0.06)';
  const spotlightGlow = useMotionTemplate`radial-gradient(350px circle at ${springX}px ${springY}px, ${spotlightColor}, transparent 80%)`;
  const borderGlow = useMotionTemplate`radial-gradient(200px circle at ${springX}px ${springY}px, rgba(239, 68, 68, 0.35), transparent 80%)`;

  if (!error) return null;
  const parsed = parseError(error);

  return (
    <AnimatePresence>
      {error && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.2 } }}
          className={`fixed inset-0 z-[10001] flex items-center justify-center p-4 ${isDarkMode ? 'bg-slate-950/85 backdrop-blur-xl' : 'bg-slate-900/50 backdrop-blur-xl'}`}
          onClick={onDismiss}
        >
          {/* Background noise + vignette */}
          <div
            className="absolute inset-0 opacity-[0.015] pointer-events-none"
            style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\'/%3E%3C/svg%3E")' }}
          />

          <motion.div
            ref={cardRef}
            onMouseMove={handleMouseMove}
            onClick={(e) => e.stopPropagation()}
            initial={{ y: 40, opacity: 0, scale: 0.92, rotateX: 8 }}
            animate={{ y: 0, opacity: 1, scale: 1, rotateX: 0 }}
            exit={{ y: 30, opacity: 0, scale: 0.95, filter: 'blur(8px)' }}
            transition={{ type: "spring", stiffness: 380, damping: 26 }}
            className="relative max-w-md w-full"
            style={{ perspective: 800 }}
          >
            {/* Outer border glow layer */}
            <motion.div
              className="absolute -inset-[1px] rounded-[2rem] opacity-70"
              style={{ background: borderGlow }}
            />

            {/* Main card */}
            <div
              className={`relative rounded-[2rem] overflow-hidden overflow-y-auto max-h-[85vh] scrollbar-thin shadow-2xl border ${
                isDarkMode
                  ? 'bg-slate-900/95 border-white/10 shadow-red-900/20 scrollbar-thumb-white/10'
                  : 'bg-white/95 border-slate-200 shadow-red-200/40 scrollbar-thumb-slate-200'
              }`}
            >
              {/* Mouse spotlight */}
              <motion.div
                className="absolute inset-0 rounded-[2rem] pointer-events-none z-0"
                style={{ background: spotlightGlow }}
              />

              <ScanLine isDarkMode={isDarkMode} />
              <ParticleBurst />

              {/* Top danger strip */}
              <motion.div
                className="h-1 w-full"
                style={{
                  background: 'linear-gradient(90deg, #ef4444, #f97316, #ef4444, #f43f5e, #ef4444)',
                  backgroundSize: '200% 100%'
                }}
                animate={{ backgroundPosition: ['0% 0%', '200% 0%'] }}
                transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
              />

              {/* Content */}
              <div className="relative z-10 p-6 flex flex-col items-center text-center">
                {/* Error code badge */}
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 }}
                  className={`mb-4 px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-[0.25em] ${
                    isDarkMode
                      ? 'bg-red-500/15 text-red-400 border border-red-500/20'
                      : 'bg-red-50 text-red-500 border border-red-200'
                  }`}
                >
                  ⚠ Error Detected
                </motion.div>

                {/* Icon */}
                <ErrorIcon type={parsed.icon} isDarkMode={isDarkMode} />

                {/* Title with glitch */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.25 }}
                  className="mt-4 mb-2"
                >
                  <GlitchText
                    text={parsed.title}
                    className={`text-xl font-black tracking-[0.15em] ${
                      isDarkMode ? 'text-white' : 'text-slate-900'
                    }`}
                  />
                </motion.div>

                {/* Description — easy to understand */}
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.35 }}
                  className={`text-[11px] font-medium leading-relaxed max-w-[340px] ${
                    isDarkMode ? 'text-slate-300' : 'text-slate-600'
                  }`}
                >
                  {parsed.desc}
                </motion.p>

                {/* Technical explanation — for developers */}
                {parsed.technical && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.42 }}
                    className={`mt-3 w-full p-3 rounded-xl border text-left ${
                      isDarkMode
                        ? 'bg-slate-800/60 border-white/5'
                        : 'bg-slate-50/80 border-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <svg viewBox="0 0 24 24" className={`w-3 h-3 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="4 17 10 11 4 5" />
                        <line x1="12" x2="20" y1="19" y2="19" />
                      </svg>
                      <span className={`text-[8px] font-black uppercase tracking-[0.2em] ${
                        isDarkMode ? 'text-slate-500' : 'text-slate-400'
                      }`}>
                        Technical Breakdown
                      </span>
                    </div>
                    <p className={`text-[9.5px] font-mono leading-relaxed ${
                      isDarkMode ? 'text-slate-400' : 'text-slate-500'
                    }`}>
                      {parsed.technical}
                    </p>
                  </motion.div>
                )}

                {/* Suggestion box */}
                {parsed.suggestion && (
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ delay: 0.5, type: "spring", stiffness: 300 }}
                    className={`mt-3 w-full p-3 rounded-xl border flex items-start gap-2.5 text-left ${
                      isDarkMode
                        ? 'bg-emerald-500/8 border-emerald-500/15'
                        : 'bg-emerald-50/80 border-emerald-200'
                    }`}
                  >
                    {/* Lightbulb icon */}
                    <motion.div
                      animate={{ rotate: [0, -10, 10, -5, 0] }}
                      transition={{ duration: 0.5, delay: 0.6 }}
                      className="flex-shrink-0 mt-0.5"
                    >
                      <svg viewBox="0 0 24 24" className={`w-4 h-4 ${isDarkMode ? 'text-emerald-400' : 'text-emerald-600'}`} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 18h6M10 22h4M12 2v1M4.2 5.2l.7.7M1 12h2M20 12h2M18.4 5.2l-.7.7M12 6a6 6 0 0 0-3 11.2V18h6v-.8A6 6 0 0 0 12 6z" />
                      </svg>
                    </motion.div>
                    <div>
                      <span className={`text-[9px] font-black uppercase tracking-[0.15em] block mb-0.5 ${
                        isDarkMode ? 'text-emerald-400' : 'text-emerald-700'
                      }`}>
                        Quick Fix
                      </span>
                      <span className={`text-[11px] font-medium leading-snug ${
                        isDarkMode ? 'text-emerald-300/80' : 'text-emerald-700/80'
                      }`}>
                        {parsed.suggestion}
                      </span>
                    </div>
                  </motion.div>
                )}

                {/* Raw error collapsible */}
                <motion.details
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.6 }}
                  className={`mt-3 w-full text-left group ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}
                >
                  <summary className="text-[8px] font-bold uppercase tracking-[0.2em] cursor-pointer hover:text-red-400 transition-colors select-none">
                    ▸ Raw Error Output
                  </summary>
                  <motion.pre
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    className={`mt-2 p-2.5 rounded-lg text-[9px] font-mono leading-relaxed break-words whitespace-pre-wrap max-h-20 overflow-auto scrollbar-thin ${
                      isDarkMode
                        ? 'bg-black/40 text-red-300/70 border border-white/5 scrollbar-thumb-white/10'
                        : 'bg-slate-50 text-red-500/70 border border-slate-200 scrollbar-thumb-slate-200'
                    }`}
                  >
                    {parsed.raw}
                  </motion.pre>
                </motion.details>

                {/* Dismiss button */}
                <motion.button
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6 }}
                  onClick={onDismiss}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  className={`mt-5 w-full p-3 rounded-[1rem] font-black uppercase tracking-[0.2em] text-[10px] flex items-center justify-center gap-2 transition-all cursor-pointer relative overflow-hidden group ${
                    isDarkMode
                      ? 'bg-white text-slate-900 shadow-lg shadow-white/10 hover:shadow-white/20'
                      : 'bg-slate-900 text-white shadow-lg shadow-slate-900/20 hover:shadow-slate-900/30'
                  }`}
                >
                  {/* Shimmer effect on hover */}
                  <div
                    className={`absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 ${
                      isDarkMode
                        ? 'bg-gradient-to-r from-transparent via-white/10 to-transparent'
                        : 'bg-gradient-to-r from-transparent via-white/20 to-transparent'
                    }`}
                  />
                  <span className="relative z-10">Dismiss</span>
                </motion.button>
              </div>

              {/* Bottom ambient glow */}
              <div
                className="absolute bottom-0 left-1/2 -translate-x-1/2 w-3/4 h-20 pointer-events-none"
                style={{
                  background: isDarkMode
                    ? 'radial-gradient(ellipse, rgba(239,68,68,0.08) 0%, transparent 70%)'
                    : 'radial-gradient(ellipse, rgba(239,68,68,0.04) 0%, transparent 70%)'
                }}
              />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
