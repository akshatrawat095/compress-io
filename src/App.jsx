import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open, message, ask } from "@tauri-apps/plugin-dialog";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { motion, AnimatePresence } from "framer-motion";
import { listen } from "@tauri-apps/api/event";
import "./App.css";

export default function App() {
  const [filePath, setFilePath] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Settings: Only Dimensions now (Size Limit removed)
  const [dimSettings, setDimSettings] = useState({ width: "", height: "" });
  const [logs, setLogs] = useState("");

  // File Type Detection
  const isImage = filePath.match(/\.(jpg|jpeg|png|webp|bmp|tiff)$/i);
  const isPdf   = filePath.match(/\.(pdf)$/i);              
  const isDoc   = filePath.match(/\.(doc|docx|txt|rtf)$/i); 
  
  // Label Logic
  let fileTypeLabel = "VID";
  if (isImage) fileTypeLabel = "IMG";
  else if (isPdf) fileTypeLabel = "PDF";
  else if (isDoc) fileTypeLabel = "DOC";

  useEffect(() => {
    // 1. Listen for backend logs
    const unlistenLogs = listen("compression-log", (event) => setLogs(event.payload.slice(-80)));
    
    // 2. Run Auto-Update Check on Startup
    checkForAppUpdates();

    return () => { unlistenLogs.then(f => f()); };
  }, []);

  // --- AUTO UPDATER FUNCTION ---
  async function checkForAppUpdates() {
    try {
      const update = await check();
      if (update?.available) {
        const yes = await ask(`Update to v${update.version} is available!\n\nRelease notes: ${update.body}`, {
          title: 'Update Available',
          kind: 'info',
          okLabel: 'Update Now',
          cancelLabel: 'Later'
        });

        if (yes) {
          await update.downloadAndInstall();
          await relaunch();
        }
      }
    } catch (error) {
      // It's normal for this to fail in "Dev Mode", so we just log it silently.
      console.log("Updater check skipped (Dev Mode or Network Error):", error);
    }
  }

  // --- FILE SELECTION ---
  async function handleFileSelect() {
    try {
      const selected = await open({
        multiple: false,
        filters: [{
          name: 'Media',
          extensions: ['jpg', 'png', 'mp4', 'mkv', 'avi', 'mov', 'pdf'] 
        }]
      });
      if (selected) {
        setFilePath(selected);
      }
    } catch (err) {
      console.error(err);
    }
  }

  // --- COMPRESSION LOGIC ---
  async function startCompression() {
    if (!filePath) return;
    
    // Safety Block for Docs
    if (isPdf || isDoc) {
      await message("Document compression is currently disabled. Please select a Video or Image.", { 
        title: "Feature Disabled", kind: "info" 
      });
      return;
    }

    setIsProcessing(true);
    setLogs("");
    
    try {
      const savedPath = await invoke("compress_file", { 
        filePath,
        width: isImage ? (dimSettings.width || "0") : "0",
        height: isImage ? (dimSettings.height || "0") : "0",
        targetSize: "0" // Always 0 since input was removed
      });
      await message(`Saved to: ${savedPath}`);
    } catch (e) { 
      console.error(e); 
      setLogs("Error: " + e);
    } finally { setIsProcessing(false); }
  }

  function removeFile() {
    setFilePath("");
    setLogs("");
    setDimSettings({ width: "", height: "" });
  }

  return (
    <div className="pastel-wrapper">
      <div className="gradient-blob blob-1"></div>
      <div className="gradient-blob blob-2"></div>
      <div className="gradient-blob blob-3"></div>

      <motion.div layout className="glass-panel">
        <header className="header-soft">
          <div className="logo-area"><span className="logo-icon">⚡</span><h1>Compress I/O</h1></div>
          <div className="status-bubble">
            <span className={`status-dot ${isProcessing ? 'pulsing' : ''}`}></span>
            {isProcessing ? "Working..." : "Idle"}
          </div>
        </header>

        <motion.div layout className="content-area">
          <AnimatePresence mode="wait">
            {!filePath ? (
              <motion.div 
                key="empty"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                whileHover={{ scale: 1.02, backgroundColor: "rgba(255,255,255,0.6)" }}
                whileTap={{ scale: 0.98 }}
                className="upload-soft"
                onClick={handleFileSelect}
              >
                <div className="icon-soft">+</div>
                <p>Click to Select Media</p>
              </motion.div>
            ) : (
              <motion.div 
                key="file"
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                className="file-card-soft"
              >
                <div className={`file-icon-soft ${(isPdf || isDoc) ? 'unsupported' : ''}`}>
                    {fileTypeLabel}
                </div>
                <div className="file-info">
                  <span className="file-name" title={filePath}>{filePath.split(/[\\/]/).pop()}</span>
                </div>
                <button className="btn-remove-soft" onClick={removeFile} disabled={isProcessing}>✕</button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* SETTINGS AREA (Only for Images) */}
        <AnimatePresence>
          {isImage && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="settings-soft">
              <div className="input-block">
                <label>Rescale Dimensions (Pixels)</label>
                <div className="row">
                  <input type="number" placeholder="Width (e.g. 1920)" value={dimSettings.width} onChange={(e) => setDimSettings({...dimSettings, width: e.target.value})} />
                  <input type="number" placeholder="Height (e.g. 1080)" value={dimSettings.height} onChange={(e) => setDimSettings({...dimSettings, height: e.target.value})} />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div layout className="footer-area">
          {!isProcessing ? (
            <motion.button whileHover={{ scale: 1.02 }} className="btn-gradient start" onClick={startCompression} disabled={!filePath}>
              {(isPdf || isDoc) ? "Format Not Supported" : "Start Optimization"}
            </motion.button>
          ) : (
            <motion.button className="btn-gradient stop" onClick={() => invoke("stop_compression")}>Stop Process</motion.button>
          )}
          {isProcessing && <motion.div className="logs-soft">{logs || "Initializing..."}</motion.div>}
        </motion.div>
      </motion.div>
    </div>
  );
}