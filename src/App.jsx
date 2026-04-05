import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open, save, message, ask } from "@tauri-apps/plugin-dialog";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { motion, AnimatePresence, Reorder, useMotionValue, useSpring, useTransform, useAnimate, useDragControls, useMotionTemplate } from "framer-motion";
import { listen } from "@tauri-apps/api/event"; 
import MotionToggle from "./components/MotionToggle";
import MotionSelect from "./components/MotionSelect";
import Magnetic from "./components/Magnetic";
import StudioBackground from "./components/StudioBackground";
import RollingDigit from "./components/RollingDigit";
import NeuralText from "./components/NeuralText";
import QuantumBurst from "./components/QuantumBurst";
import CinematicIntro from "./components/CinematicIntro";
import Icon from "./components/Icon";
import FileQueueItem from "./components/FileQueueItem";
import DashboardHeader from "./components/DashboardHeader";
import SettingsDeck from "./components/SettingsDeck";

export default function App() {
  const [showIntro, setShowIntro] = useState(true);
  const [appMode, setAppMode] = useState("compress");
  const [isDarkMode, setIsDarkMode] = useState(false);
  
  const [fileQueue, setFileQueue] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(null);
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [isIndeterminate, setIsIndeterminate] = useState(false); 
  const [logs, setLogs] = useState("");
  
  const [useGpu, setUseGpu] = useState(false);
  const [dimSettings, setDimSettings] = useState({ width: "", height: "" });

  const [aiScale, setAiScale] = useState("4"); 
  const [aiFormat, setAiFormat] = useState("webp"); 
  const [faceRestore, setFaceRestore] = useState(false); 
  const [aiVideoModel, setAiVideoModel] = useState("anime");
  const [aiFps, setAiFps] = useState("0");
  const [denoise, setDenoise] = useState(false);
  const [stabilize, setStabilize] = useState(false);
  const [hyperDetail, setHyperDetail] = useState(false);
  const [tileSize, setTileSize] = useState("0");
  
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [showComparison, setShowComparison] = useState(false);
  const [enhancedPath, setEnhancedPath] = useState("");
  const [sliderPos, setSliderPos] = useState(50);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [originalImgSrc, setOriginalImgSrc] = useState(""); 
  const [enhancedImgSrc, setEnhancedImgSrc] = useState(""); 

  const [successData, setSuccessData] = useState(null);
  const [isDragging, setIsDragging] = useState(false);

  const [progress, setProgress] = useState(0);
  const [timeLeft, setTimeLeft] = useState(null);
  const totalDurationRef = useRef(0);
  const enhanceStartTimeRef = useRef(0);
  const totalPrepFrames = useRef(0);
  const isStoppingRef = useRef(false);

  const rawProgress = useMotionValue(0);
  const springProgress = useSpring(rawProgress, { stiffness: 60, damping: 18 });
  const displayProgress = useTransform(springProgress, (v) => Math.round(v));

  const auraOpacity = useTransform(springProgress, [0, 50, 100], [0.06, 0.15, 0.45]);
  const auraRadius = useTransform(springProgress, [0, 100], [220, 500]);

  const [successScope, animateSuccess] = useAnimate();

  const sliderX = useMotionValue(50);
  const dragControls = useDragControls();
  const sliderContainerRef = useRef(null);

  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  
  const glowBorder = useMotionTemplate`radial-gradient(${auraRadius}px circle at ${mouseX}px ${mouseY}px, rgba(139,92,246,${auraOpacity}), rgba(139,92,246,0.06) 60%, transparent 100%)`;

  const getFileType = useCallback((ext) => {
    if (['jpg', 'jpeg', 'png', 'webp', 'bmp', 'tiff'].includes(ext)) return 'IMG';
    if (['mp4', 'mkv', 'avi', 'mov', 'webm', 'flv', 'wmv', 'm4v', 'ts', 'ogv', 'gif'].includes(ext)) return 'VID';
    return 'DOC';
  }, []);

  const formatTime = useCallback((seconds) => {
    if (seconds < 0) return "Calculating...";
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s}s`;
  }, []);

  const checkForAppUpdates = useCallback(async () => {
    try {
      const update = await check();
      if (update) {
        const canUpdate = await ask(`Version ${update.version} is available! Update now?`, {
          title: "Update Available",
          kind: "info"
        });
        if (canUpdate) {
          await update.downloadAndInstall();
          await relaunch();
        }
      }
    } catch (e) {
      console.warn("Update check failed:", e);
    }
  }, []);

  useEffect(() => {
    let unlistenFfmpeg, unlistenEnhance;

    const setupListeners = async () => {
      checkForAppUpdates();

      unlistenFfmpeg = await listen("ffmpeg-progress", (event) => {
        const line = event.payload;
        const durationMatch = line.match(/Duration:\s+(\d{2}):(\d{2}):(\d{2})/);
        if (durationMatch) {
          const h = parseInt(durationMatch[1]);
          const m = parseInt(durationMatch[2]);
          const s = parseInt(durationMatch[3]);
          totalDurationRef.current = (h * 3600) + (m * 60) + s;
        }
        const timeMatch = line.match(/time=(\d{2}):(\d{2}):(\d{2})/);
        if (timeMatch && totalDurationRef.current > 0) {
          const h = parseInt(timeMatch[1]);
          const m = parseInt(timeMatch[2]);
          const s = parseInt(timeMatch[3]);
          const currentSeconds = (h * 3600) + (m * 60) + s;
          const percent = Math.round((currentSeconds / totalDurationRef.current) * 100);
          setProgress(percent);
          rawProgress.set(percent);
          const remaining = totalDurationRef.current - currentSeconds;
          setTimeLeft(formatTime(remaining));
        }
        setLogs(line);
      });

      unlistenEnhance = await listen("enhance-progress", async (event) => {
        if (appMode !== 'enhance') return;
        const line = event.payload;

        if (line.startsWith("Turbo Engine Adjusted:")) {
          setLogs(line);
          return;
        }

        if (line.startsWith("Prep: Count:")) {
          totalPrepFrames.current = parseInt(line.split(":")[2]);
          return;
        }

        if (line.startsWith("Prep: Processing:")) {
          const currentFrame = parseInt(line.split(":")[2]);
          if (totalPrepFrames.current > 0) {
            const p = Math.floor((currentFrame / totalPrepFrames.current) * 10);
            setProgress(Math.max(p, 1));
            rawProgress.set(Math.max(p, 1));
            setTimeLeft(`${currentFrame} / ${totalPrepFrames.current} Frames Recovered`);
            setIsIndeterminate(false);
          }
          return;
        }

        if (line.startsWith("Prep: Finalized:")) {
          const actual = parseInt(line.split(":")[2]);
          totalPrepFrames.current = actual;
          setProgress(10);
          rawProgress.set(10);
          setTimeLeft(`GPU Ready: Launching Turbo Engine...`);
          setIsIndeterminate(false);
          return;
        }

        if (line.startsWith("Prep: Active:")) {
          const msg = line.replace("Prep: Active:", "");
          setTimeLeft(msg);
          setLogs(msg);
          setIsIndeterminate(true);
          return;
        }

        if (line.startsWith("Prep:")) {
          setIsIndeterminate(true);
          setLogs(line);
          return;
        }

        const match = line.match(/([\d.]+)%/);
        if (match) {
          setIsIndeterminate(false);
          const rawPct = parseFloat(match[1]);
          // Map 0-100 AI progress to 10-95% of the total bar
          const mappedPercent = Math.round(10 + (rawPct * 0.85));
          setProgress(mappedPercent);
          rawProgress.set(mappedPercent);
          
          if (rawPct > 0) {
            const elapsed = (Date.now() - enhanceStartTimeRef.current) / 1000;
            const totalEst = elapsed / (rawPct / 100);
            const remaining = totalEst - elapsed;
            setTimeLeft(formatTime(Math.round(remaining)));
          }
        } else {
          setLogs(line);
        }
      });
    };

    setupListeners();

    return () => {
      if (unlistenFfmpeg) unlistenFfmpeg();
      if (unlistenEnhance) unlistenEnhance();
    };
  }, [formatTime, rawProgress, checkForAppUpdates]);

  useEffect(() => {
    if (successData && successScope.current) {
      animateSuccess(successScope.current, 
        { scale: [1, 1.05, 1], boxShadow: ["0 0 0px rgba(139,92,246,0)", "0 0 40px rgba(139,92,246,0.3)", "0 0 0px rgba(139,92,246,0)"] },
        { duration: 0.8, times: [0, 0.5, 1] }
      );
    }
  }, [successData, animateSuccess, successScope]);

  const processFiles = useCallback(async (paths, currentMode) => {
    const validExtensions = ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'tiff', 'mp4', 'mkv', 'avi', 'mov', 'webm', 'flv', 'wmv', 'm4v', 'ts', 'ogv', 'gif'];
    const newFiles = paths
      .filter(filePath => {
        const ext = filePath.split('.').pop().toLowerCase();
        return validExtensions.includes(ext);
      })
      .map(filePath => {
        const ext = filePath.split('.').pop().toLowerCase();
        return {
          path: filePath,
          name: filePath.split(/[\\/]/).pop(),
          ext: ext,
          type: getFileType(ext),
          status: 'queued',
          finalPath: null 
        };
      });

    if (newFiles.length === 0) return;

    setFileQueue(prev => {
      const combined = [...prev, ...newFiles];
      return combined.filter((v, i, a) => a.findIndex(v2 => (v2.path === v.path)) === i);
    });

    setLogs(""); setProgress(0); setTimeLeft(null);
    totalDurationRef.current = 0; setDimSettings({ width: "", height: "" });
    setUseGpu(false); setIsIndeterminate(false);
  }, [getFileType]);

  useEffect(() => {
    let unlistenEnter, unlistenLeave, unlistenDrop;

    const setupDragListeners = async () => {
      unlistenEnter = await listen('tauri://drag-enter', () => setIsDragging(true));
      unlistenLeave = await listen('tauri://drag-leave', () => setIsDragging(false));
      unlistenDrop = await listen('tauri://drag-drop', (event) => {
        setIsDragging(false);
        const paths = event.payload?.paths || event.payload; 
        if (Array.isArray(paths)) {
           processFiles(paths, appMode);
        }
      });
    };

    setupDragListeners();

    return () => {
      if (unlistenEnter) unlistenEnter();
      if (unlistenLeave) unlistenLeave();
      if (unlistenDrop) unlistenDrop();
    };
  }, [appMode, processFiles]);

  const handleFileSelect = useCallback(async () => {
    const selected = await open({
      multiple: true,
      filters: [{ name: 'Media', extensions: ['jpg', 'jpeg', 'png', 'webp', 'mp4', 'mkv', 'avi', 'mov', 'webm'] }]
    });
    if (selected && selected.length > 0) {
      processFiles(selected, appMode);
    }
  }, [appMode, processFiles]);

  const stopJob = useCallback(async () => {
    try {
      await invoke("stop_job");
      isStoppingRef.current = true;
      setIsProcessing(false);
      setIsIndeterminate(false);
      setTimeLeft("PROCESS HALTED");
      setProgress(0);
      setFileQueue(prev => prev.map(f => f.status === 'processing' ? {...f, status: 'queued'} : f));
    } catch (e) {
      console.error("Stop failed:", e);
    }
  }, []);

  const startJob = useCallback(async () => {
    isStoppingRef.current = false;
    setLogs(""); setProgress(0); setTimeLeft(null);
    if (fileQueue.length === 0) return;

    isStoppingRef.current = false;
    setIsProcessing(true);
    setLogs(""); setProgress(0); rawProgress.set(0); setTimeLeft(null);
    totalDurationRef.current = 0; setIsIndeterminate(false);

    let outputFolder = "";
    let singleSavePath = "";

    if (fileQueue.length === 1) {
      const file = fileQueue[0];
      const targetExt = (appMode === "enhance" && file.type === "VID") ? "mp4" : 
                        (appMode === "enhance" && file.type === "IMG") ? aiFormat : file.ext;
      const prefix = appMode === "enhance" ? "enhanced" : "compressed";
      const baseName = file.name.substring(0, file.name.lastIndexOf('.'));
      
      singleSavePath = await save({
        filters: [{ name: "Media", extensions: [targetExt] }],
        defaultPath: `${baseName}_${prefix}.${targetExt}`
      });

      if (!singleSavePath) { setIsProcessing(false); return; } 
    } else {
      outputFolder = await open({
        directory: true,
        multiple: false,
        title: "Select Output Folder for Batch Processing"
      });

      if (!outputFolder) { setIsProcessing(false); return; } 
    }

    let finalPath = "";
    let localSuccessCount = 0; 

    for (let i = 0; i < fileQueue.length; i++) {
      if (isStoppingRef.current) break;
      const file = fileQueue[i];
      if (file.status === 'done') continue;

      setCurrentIndex(i);
      setFileQueue(prev => prev.map((f, idx) => idx === i ? {...f, status: 'processing'} : f));
      
      if (file.type === 'DOC') {
         setFileQueue(prev => prev.map((f, idx) => idx === i ? {...f, status: 'error'} : f));
         continue;
      }

      if (fileQueue.length === 1) {
        finalPath = singleSavePath;
      } else {
        const targetExt = (appMode === "enhance" && file.type === "VID") ? "mp4" : 
                          (appMode === "enhance" && file.type === "IMG") ? aiFormat : file.ext;
        const prefix = appMode === "enhance" ? "enhanced" : "compressed";
        const baseName = file.name.substring(0, file.name.lastIndexOf('.'));
        const separator = outputFolder.includes('\\') ? '\\' : '/';
        finalPath = `${outputFolder}${separator}${baseName}_${prefix}_${Date.now()}_${i}.${targetExt}`;
      }

      try {
        if (appMode === "enhance") {
          enhanceStartTimeRef.current = Date.now();
          if (file.type === 'VID') {
              setIsIndeterminate(true); setProgress(0); setTimeLeft("Preparing AI Models...");
              await invoke("enhance_video", { 
                  input: file.path, 
                  output: finalPath, 
                  autoGpu: useGpu, 
                  modelType: aiVideoModel, 
                  aiScale: aiScale, 
                  aiFps: aiFps,
                  denoise: denoise,
                  stabilize: stabilize,
                  hyperDetail: hyperDetail,
                  faceRestore: faceRestore,
                  tileSize: tileSize
              });
          } else if (file.type === 'IMG') {
              setIsIndeterminate(true); setProgress(0); setTimeLeft("Warming up GPU & Processing...");
              await invoke("enhance_image", { 
                  input: file.path, 
                  output: finalPath, 
                  scale: aiScale, 
                  format: aiFormat, 
                  modelType: aiVideoModel, 
                  faceRestore: faceRestore,
                  hyperDetail: hyperDetail,
                  tileSize: tileSize
              });
          } else {
              setFileQueue(prev => prev.map((f, idx) => idx === i ? {...f, status: 'error'} : f));
              continue;
          }
        } else {
          setIsIndeterminate(false); setProgress(0); setTimeLeft("Starting...");
          if (file.type === 'IMG') {
            await invoke("compress_image", { input: file.path, output: finalPath, width: dimSettings.width || "0", height: dimSettings.height || "0" });
          } else {
            await invoke("compress_video", { input: file.path, output: finalPath, autoGpu: useGpu });
          }
        }
        
        setProgress(100);
        localSuccessCount++; 
        setFileQueue(prev => prev.map((f, idx) => idx === i ? {...f, status: 'done', finalPath: finalPath} : f));

      } catch (e) {
        console.error(e);
        setLogs("Error: " + e);
        setFileQueue(prev => prev.map((f, idx) => idx === i ? {...f, status: 'error'} : f));
      }
    }

    setIsProcessing(false); setIsIndeterminate(false); setTimeLeft(null); setCurrentIndex(null);
    const savedLocation = fileQueue.length === 1 ? singleSavePath : outputFolder;
    if (localSuccessCount > 0) {
        setSuccessData({ count: localSuccessCount, path: savedLocation });
    }
  }, [fileQueue, appMode, aiFormat, aiScale, aiVideoModel, aiFps, useGpu, denoise, stabilize, hyperDetail, faceRestore, tileSize, dimSettings, rawProgress, formatTime]);

  const viewComparison = useCallback(async (file) => {
    setSliderPos(50);
    sliderX.set(50);
    if (!file.finalPath || file.type !== 'IMG') return;
    
    setOriginalImgSrc(""); setEnhancedImgSrc(""); setZoomLevel(1);
    
    try {
      const origBytes = await invoke("read_file_bytes", { path: file.path });
      const enhBytes = await invoke("read_file_bytes", { path: file.finalPath });
      
      setOriginalImgSrc(URL.createObjectURL(new Blob([new Uint8Array(origBytes)])));
      setEnhancedImgSrc(URL.createObjectURL(new Blob([new Uint8Array(enhBytes)])));
      setEnhancedPath(file.finalPath);
      setShowComparison(true);
    } catch (e) {
      console.error("Could not load preview:", e);
      message("Could not load preview.", { title: "Error", kind: "error" });
    }
  }, [sliderX]);

  const removeFile = useCallback((indexToRemove) => {
    setFileQueue(prev => {
      const newQueue = prev.filter((_, i) => i !== indexToRemove);
      if (newQueue.length === 0) {
        setLogs(""); setProgress(0);
      }
      return newQueue;
    });
  }, []);

  const clearAll = useCallback(() => {
      setFileQueue([]); setLogs(""); setProgress(0);
  }, []);

  const closeComparison = useCallback(() => {
    setShowComparison(false);
    if (originalImgSrc) URL.revokeObjectURL(originalImgSrc);
    if (enhancedImgSrc) URL.revokeObjectURL(enhancedImgSrc);
    setOriginalImgSrc(""); setEnhancedImgSrc(""); setEnhancedPath("");
  }, [originalImgSrc, enhancedImgSrc]);

  const hasImages = useMemo(() => fileQueue.length > 0 ? fileQueue[0].type === 'IMG' : false, [fileQueue]);
  const hasVideos = useMemo(() => fileQueue.length > 0 ? fileQueue[0].type === 'VID' : false, [fileQueue]);

  return (
    <div 
      onMouseMove={(e) => { mouseX.set(e.clientX); mouseY.set(e.clientY); }}
      onDragEnter={() => setIsDragging(true)}
      onDragLeave={() => setIsDragging(false)}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDrop={() => setIsDragging(false)}
      className="relative min-h-screen w-full flex items-center justify-center p-4 md:p-8 overflow-hidden selection:bg-studio-violet/30"
    >
      <StudioBackground 
        progress={progress} 
        isProcessing={isProcessing} 
        appMode={appMode} 
        isDarkMode={isDarkMode} 
        mouseX={mouseX} 
        mouseY={mouseY}
        isDragging={isDragging}
      />
      
      <AnimatePresence mode="wait">
        {showIntro && (
          <CinematicIntro key="intro" onComplete={() => setShowIntro(false)} appMode={appMode} isDarkMode={isDarkMode} />
        )}
      </AnimatePresence>

      <motion.main 
        layout
        variants={{
          hidden: { opacity: 0 },
          visible: { 
            opacity: 1, 
            transition: { 
              staggerChildren: 0.12,
              delayChildren: 0.1
            } 
          }
        }}
        initial="hidden"
        animate={showIntro ? "hidden" : "visible"}
        style={{ borderImage: glowBorder }}
        className={`relative z-10 w-full max-w-xl studio-glass p-3 flex flex-col shadow-studio-2xl border transition-all duration-700 ${isDarkMode ? 'border-white/5 bg-studio-obsidian/40' : 'border-slate-200 bg-white/60'}`}
      >
        <motion.div
          variants={{
            hidden: { opacity: 0, y: -10 },
            visible: { opacity: 1, y: 0 }
          }}
          className="flex-none mb-2"
        >
          <DashboardHeader appMode={appMode} isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} isProcessing={isProcessing} stats={{ compressedSize: "0", originalSize: "0", totalFiles: fileQueue.length }} />
        </motion.div>



        <motion.section 
          layout 
          variants={{
            hidden: { y: 40, opacity: 0, filter: "blur(10px)" },
            visible: { 
              y: 0, 
              opacity: 1, 
              filter: "blur(0px)",
              transition: { type: "spring", stiffness: 350, damping: 24 } 
            }
          }}
          className="flex-1 overflow-y-auto custom-scrollbar pr-2 -mr-2 mt-1 mb-2 flex flex-col gap-2"
        >
          <AnimatePresence mode="wait">
            {fileQueue.length === 0 ? (
              <motion.div 
                key="empty" 
                initial={{ opacity: 0, y: 10 }} 
                animate={{ opacity: 1, y: 0 }} 
                exit={{ opacity: 0, scale: 0.95 }} 
                className="flex-1 flex flex-col items-center justify-start max-w-md w-full mx-auto p-2 gap-2"
              >
                <div 
                  onClick={handleFileSelect} 
                  className={`p-2 rounded-[1rem] border-2 border-dashed flex flex-col items-center justify-center gap-1 group transition-all duration-700 min-h-[60px] w-full ${
                    isDarkMode 
                      ? 'bg-studio-obsidian/40 border-white/5 hover:border-studio-violet/40 hover:bg-studio-violet/5' 
                      : 'bg-slate-50 border-slate-200 hover:border-studio-violet/40 hover:bg-slate-100 shadow-sm'
                  }`}
                >
                   <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-700 group-hover:rotate-90 group-hover:scale-110 ${
                     isDarkMode ? 'bg-studio-violet/10 text-studio-violet' : 'bg-white text-studio-violet shadow-lg border border-slate-100'
                   }`}>
                      <Icon name="plus" className="w-4 h-4" stroke={2.5} />
                   </div>
                   <div className="text-center px-4">
                      <p className={`text-[9px] font-black uppercase tracking-widest ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                        Select or Drop Media
                      </p>
                   </div>
                </div>
              </motion.div>
            ) : (
              <motion.div key="queue" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col gap-2">
                 <div className="flex justify-between items-center px-2">
                  <span className={`text-[9px] font-black uppercase tracking-widest ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    {fileQueue.length} {fileQueue.length === 1 ? 'FILE' : 'FILES'} QUEUED
                  </span>
                  <button onClick={clearAll} disabled={isProcessing} className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-rose-500 hover:text-rose-600 transition-colors disabled:opacity-30">
                    <Icon name="trash" className="w-3 h-3" />
                    Clear
                  </button>
                </div>
                
                <Reorder.Group axis="y" values={fileQueue} onReorder={setFileQueue} className="flex flex-col gap-1.5 max-h-[180px] overflow-y-auto custom-scrollbar pr-1">
                  {fileQueue.map((file, i) => (
                    <FileQueueItem 
                       key={file.path} 
                       file={file} 
                       index={i} 
                       isDarkMode={isDarkMode} 
                       isProcessing={isProcessing} 
                       currentIndex={currentIndex} 
                       progress={progress} 
                       onViewComparison={viewComparison} 
                       onRemove={removeFile} 
                    />
                  ))}
                </Reorder.Group>
              </motion.div>
            )}
          </AnimatePresence>

          <SettingsDeck 
             isDarkMode={isDarkMode}
             appMode={appMode}
             hasImages={hasImages}
             hasVideos={hasVideos}
             useGpu={useGpu}
             setUseGpu={setUseGpu}
             dimSettings={dimSettings}
             setDimSettings={setDimSettings}
             aiVideoModel={aiVideoModel}
             setAiVideoModel={setAiVideoModel}
             aiFormat={aiFormat}
             setAiFormat={setAiFormat}
             aiScale={aiScale}
             setAiScale={setAiScale}
             aiFps={aiFps}
             setAiFps={setAiFps}
             faceRestore={faceRestore}
             setFaceRestore={setFaceRestore}
             hyperDetail={hyperDetail}
             setHyperDetail={setHyperDetail}
             denoise={denoise}
             setDenoise={setDenoise}
             stabilize={stabilize}
             setStabilize={setStabilize}
             tileSize={tileSize}
             setTileSize={setTileSize}
             isProcessing={isProcessing}
             startJob={startJob}
             stopJob={stopJob}
             progress={progress}
             timeLeft={timeLeft}
          />
        </motion.section>
      </motion.main>

      <AnimatePresence>
        {showComparison && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={`fixed inset-0 z-[50000] backdrop-blur-2xl flex flex-col p-8 ${isDarkMode ? 'bg-studio-obsidian/95' : 'bg-slate-50/95'}`}>
             <header className="flex justify-between items-center mb-8">
               <h2 className={`text-2xl font-black tracking-widest uppercase ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Direct Preview Comparison</h2>
               <button onClick={closeComparison} className={`px-6 py-3 rounded-xl font-black uppercase text-[10px] tracking-widest transition-all ${isDarkMode ? 'bg-white/5 hover:bg-white/10 text-white' : 'bg-white border border-slate-200 text-slate-600 shadow-sm hover:bg-slate-50'}`}>Close Suite</button>
             </header>
             <div className="flex-1 flex gap-8 items-center justify-center">
                <div className={`relative aspect-video w-full max-w-5xl rounded-[3rem] overflow-hidden border shadow-studio-xl ${isDarkMode ? 'border-white/10' : 'border-slate-200'}`}>
                   <img src={originalImgSrc} className="absolute inset-0 w-full h-full object-contain" />
                   <motion.div className="absolute inset-0 w-full h-full object-contain overflow-hidden" style={{ clipPath: `inset(0 0 0 ${sliderPos}%)` }}>
                      <img src={enhancedImgSrc} className="w-full h-full object-contain" />
                   </motion.div>
                   <input type="range" min="0" max="100" value={sliderPos} onChange={(e) => setSliderPos(e.target.value)} className="absolute inset-0 w-full h-full opacity-0 cursor-ew-resize z-20" />
                   <div className="absolute top-0 bottom-0 w-1 bg-white shadow-xl z-10 pointer-events-none" style={{ left: `${sliderPos}%` }} />
                </div>
             </div>
          </motion.div>
        )}
      </AnimatePresence>

       <AnimatePresence>
        {successData && (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }} 
            className={`fixed inset-0 z-[10000] flex items-center justify-center p-6 ${isDarkMode ? 'bg-slate-900/60' : 'bg-slate-900/10'}`}
          >
            <motion.div 
               ref={successScope}
               initial={{ y: 20, opacity: 0, scale: 0.98 }} 
               animate={{ y: 0, opacity: 1, scale: 1 }}
               exit={{ y: 15, opacity: 0, scale: 0.98 }}
               transition={{ type: "spring", stiffness: 400, damping: 30 }}
               className="relative max-w-lg w-full studio-glass p-12 flex flex-col items-center text-center shadow-studio-2xl border border-white/10"
            >
               <div className={`w-20 h-20 rounded-[2rem] flex items-center justify-center mb-6 shadow-lg transition-all duration-700 ${
                  appMode === 'compress' 
                  ? 'bg-studio-violet shadow-studio-violet/30' 
                  : 'bg-gradient-to-br from-studio-violet to-studio-rose shadow-studio-rose/30'
               }`}>
                  <Icon 
                    name={appMode === 'compress' ? 'zap' : 'sparkles'} 
                    className="w-10 h-10 text-white" 
                    stroke={1.5} 
                  />
               </div>
               
               <h2 className={`text-3xl font-black mb-4 italic uppercase tracking-widest ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                 {appMode === 'compress' ? 'Compressed' : 'Enhanced'}
               </h2>
               
               <p className={`mb-6 font-medium text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                 {successData.count} {successData.count === 1 ? 'asset has' : 'assets have'} been successfully processed.
               </p>

               <div className={`w-full mb-8 p-4 rounded-2xl border text-left flex flex-col gap-2 ${isDarkMode ? 'bg-white/5 border-white/5' : 'bg-slate-100 border-slate-200'}`}>
                  <span className={`text-[9px] font-black uppercase tracking-widest ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>Destination Folder</span>
                  <p className={`text-[11px] font-mono break-all font-bold ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                    {successData.path}
                  </p>
               </div>

               <button 
                 onClick={() => setSuccessData(null)} 
                 className={`w-full py-5 rounded-2xl font-black uppercase tracking-widest hover:scale-[1.02] active:scale-95 transition-all shadow-xl ${
                   isDarkMode ? 'bg-white text-slate-900 shadow-white/5' : 'bg-slate-900 text-white shadow-slate-900/20'
                 }`}
               >
                 DONE
               </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 🚀 Cinematic Ingest: The "Portal" Drop Zone */}
      <AnimatePresence>
        {isDragging && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none"
          >
            <div className={`absolute inset-0 backdrop-blur-xl transition-colors duration-700 ${
              isDarkMode ? 'bg-slate-950/90' : (appMode === 'compress' ? 'bg-studio-violet/15' : 'bg-studio-rose/15')
            }`} />
            
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
              className="relative flex flex-col items-center gap-8"
            >
              {/* 📽️ Studio Viewfinder HUD: Corner Ticks */}
              <div className="relative w-80 h-80 flex items-center justify-center">
                 {/* Top Left */}
                 <motion.div 
                    animate={{ x: [-2, 0, -2], y: [-2, 0, -2], opacity: [0.3, 0.6, 0.3] }}
                    transition={{ duration: 4, repeat: Infinity }}
                    className={`absolute top-0 left-0 w-14 h-14 border-t-2 border-l-2 shadow-[0_0_15px_rgba(255,255,255,0.05)] ${
                      appMode === 'compress' ? 'border-studio-violet' : 'border-studio-rose'
                    }`} 
                 />
                 {/* Top Right */}
                 <motion.div 
                    animate={{ x: [2, 0, 2], y: [-2, 0, -2], opacity: [0.3, 0.6, 0.3] }}
                    transition={{ duration: 4, repeat: Infinity }}
                    className={`absolute top-0 right-0 w-14 h-14 border-t-2 border-r-2 shadow-[0_0_15px_rgba(255,255,255,0.05)] ${
                      appMode === 'compress' ? 'border-studio-violet' : 'border-studio-rose'
                    }`} 
                 />
                 {/* Bottom Left */}
                 <motion.div 
                    animate={{ x: [-2, 0, -2], y: [2, 0, 2], opacity: [0.3, 0.6, 0.3] }}
                    transition={{ duration: 4, repeat: Infinity }}
                    className={`absolute bottom-0 left-0 w-14 h-14 border-b-2 border-l-2 shadow-[0_0_15px_rgba(255,255,255,0.05)] ${
                      appMode === 'compress' ? 'border-studio-violet' : 'border-studio-rose'
                    }`} 
                 />
                 {/* Bottom Right */}
                 <motion.div 
                    animate={{ x: [2, 0, 2], y: [2, 0, 2], opacity: [0.3, 0.6, 0.3] }}
                    transition={{ duration: 4, repeat: Infinity }}
                    className={`absolute bottom-0 right-0 w-14 h-14 border-b-2 border-r-2 shadow-[0_0_15px_rgba(255,255,255,0.05)] ${
                      appMode === 'compress' ? 'border-studio-violet' : 'border-studio-rose'
                    }`} 
                 />

                 {/* Center Tech Badge */}
                 <div className="flex flex-col items-center gap-6">
                    <div className={`w-28 h-28 rounded-3xl flex items-center justify-center border border-white/20 studio-glass shadow-2xl ${
                      isDarkMode 
                      ? 'bg-white/5 shadow-[0_0_40px_rgba(0,0,0,0.5)]' 
                      : (appMode === 'compress' ? 'bg-studio-violet/10' : 'bg-studio-rose/10')
                    }`}>
                      <Icon name="studioUpload" className={`w-12 h-12 ${
                        appMode === 'compress' ? 'text-studio-violet' : 'text-studio-rose'
                      } ${isDarkMode ? 'brightness-125' : ''}`} stroke={1.2} />
                    </div>
                    
                    <div className="flex flex-col items-center">
                       <h2 className={`text-3xl font-black uppercase tracking-[0.3em] text-center ${
                         isDarkMode ? 'text-white' : 'text-slate-900'
                       } ${
                         appMode === 'compress' ? 'drop-shadow-[0_0_20px_rgba(139,92,246,0.6)]' : 'drop-shadow-[0_0_20px_rgba(244,63,94,0.6)]'
                       }`}>
                         DROP HERE
                       </h2>
                    </div>
                 </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
