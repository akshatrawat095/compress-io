import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { motion, AnimatePresence, Reorder, useMotionValue, useSpring, useTransform, useAnimate, useMotionTemplate } from "framer-motion";
import { listen } from "@tauri-apps/api/event"; 
import StudioBackground from "./components/StudioBackground";
import CinematicIntro from "./components/CinematicIntro";
import Icon from "./components/Icon";
import FileQueueItem from "./components/FileQueueItem";
import DashboardHeader from "./components/DashboardHeader";
import SettingsDeck from "./components/SettingsDeck";
import UpdaterModal from "./components/UpdaterModal";
import EngineSetupModal from "./components/EngineSetupModal";
import ErrorToast from "./components/ErrorToast";
import NumberFlow from "@number-flow/react";
import { useUpdater } from "./hooks/useUpdater";
import { useFfmpegRuntime } from "./hooks/useFfmpegRuntime";

export default function App() {
  const [showIntro, setShowIntro] = useState(true);
  const appMode = "compress";
  const [isDarkMode, setIsDarkMode] = useState(false);
  const updater = useUpdater();
  const ffmpegRuntime = useFfmpegRuntime();
  
  const [fileQueue, setFileQueue] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(null);
  
  const [isProcessing, setIsProcessing] = useState(false);
  
  const [useGpu, setUseGpu] = useState(true);
  const [hwInfo, setHwInfo] = useState({ tier: "cpu", encoder: "libx265", label: "Checking...", can_dual_engine: false });
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

  const [targetSizeEnabled, setTargetSizeEnabled] = useState(false);
  const [targetSize, setTargetSize] = useState("");
  const [targetSizeUnit, setTargetSizeUnit] = useState("MB");
  const [targetFormat, setTargetFormat] = useState("same");

  const [showComparison, setShowComparison] = useState(false);
  const [sliderPos, setSliderPos] = useState(50);
  const [originalImgSrc, setOriginalImgSrc] = useState(""); 
  const [enhancedImgSrc, setEnhancedImgSrc] = useState(""); 

  const [successData, setSuccessData] = useState(null);
  const [errorToast, setErrorToast] = useState(null);
  const [isDragging, setIsDragging] = useState(false);

  const [progress, setProgress] = useState(0);
  const [timeLeft, setTimeLeft] = useState(null);
  const compressStartTimeRef = useRef(0);
  const lastEtaRef = useRef(0);
  const smoothedSpeedRef = useRef(0);
  const isBatchPoolRef = useRef(false);
  const batchTotalCountRef = useRef(0);
  const batchCompletedRef = useRef(0);
  const activeJobProgressRef = useRef({});
  const enhanceStartTimeRef = useRef(0);
  const totalPrepFrames = useRef(0);
  const isStoppingRef = useRef(false);

  useEffect(() => {
    if (!ffmpegRuntime.isReady) return;
    invoke("detect_hardware_tier")
      .then((info) => {
        if (info) setHwInfo(info);
      })
      .catch(() => {
        setHwInfo({ tier: "cpu", encoder: "libx265", label: "Tuned CPU", can_dual_engine: false });
      });
  }, [ffmpegRuntime.isReady]);

  const rawProgress = useMotionValue(0);
  const springProgress = useSpring(rawProgress, { stiffness: 60, damping: 18 });

  const auraOpacity = useTransform(springProgress, [0, 50, 100], [0.06, 0.15, 0.45]);
  const auraRadius = useTransform(springProgress, [0, 100], [220, 500]);

  const [successScope, animateSuccess] = useAnimate();

  const sliderX = useMotionValue(50);

  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  
  const glowBorder = useMotionTemplate`radial-gradient(${auraRadius}px circle at ${mouseX}px ${mouseY}px, rgba(138,162,130,${auraOpacity}), rgba(66,79,60,0.06) 60%, transparent 100%)`;

  const getFileType = useCallback((ext) => {
    if (['jpg', 'jpeg', 'png', 'webp', 'bmp', 'tiff'].includes(ext)) return 'IMG';
    if (['mp4', 'mkv', 'avi', 'mov', 'webm', 'flv', 'wmv', 'm4v', 'ts', 'ogv', 'gif'].includes(ext)) return 'VID';
    if (['mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg', 'opus', 'wma'].includes(ext)) return 'AUD';
    return 'DOC';
  }, []);

  const formatTime = useCallback((seconds) => {
    if (!Number.isFinite(seconds) || seconds < 0) return "Calculating...";
    const total = Math.max(0, Math.round(seconds));
    if (total < 60) return `${total}s`;
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m ${s}s`;
  }, []);


  useEffect(() => {
    let unlistenTelemetry, unlistenEnhance;

    const setupListeners = async () => {
      unlistenTelemetry = await listen("ffmpeg-telemetry", (event) => {
        const { job_id, current_secs, total_secs, speed, pass, total_passes, overall_percent, finalizing } = event.payload;

        if (isBatchPoolRef.current) {
          if (batchTotalCountRef.current <= 0) return;
          activeJobProgressRef.current[job_id || "default"] = Math.min(99, Math.max(0, overall_percent));
          const sumActive = Object.values(activeJobProgressRef.current).reduce((acc, v) => acc + v, 0);
          const batchPct = Math.min(99, Math.round(((batchCompletedRef.current * 100) + sumActive) / batchTotalCountRef.current));
          setProgress(batchPct);
          rawProgress.set(batchPct);

          const elapsedWall = (Date.now() - compressStartTimeRef.current) / 1000;
          if (elapsedWall >= 2.0 && batchPct >= 2) {
            const fraction = batchPct / 100;
            const eta = elapsedWall * ((1 - fraction) / fraction);
            setTimeLeft(`${batchCompletedRef.current}/${batchTotalCountRef.current} · ${formatTime(Math.max(1, Math.round(eta)))}`);
          }
          return;
        }

        const pct = Math.min(99, Math.max(0, Math.round(overall_percent)));
        setProgress(pct);
        rawProgress.set(pct);

        if (finalizing && pct >= 99) {
          setTimeLeft("Finalizing stream...");
          return;
        }

        const elapsedWall = (Date.now() - compressStartTimeRef.current) / 1000;
        const passPrefix = total_passes === 2 ? `Pass ${pass}/2 · ` : "";

        if (elapsedWall < 1.5 || total_secs <= 0 || current_secs < 0.25) {
          setTimeLeft(`${passPrefix}Calculating...`);
          return;
        }

        if (speed > 0.01) {
          smoothedSpeedRef.current = smoothedSpeedRef.current > 0
            ? (smoothedSpeedRef.current * 0.85) + (speed * 0.15)
            : speed;
        }

        const effSpeed = smoothedSpeedRef.current;
        const fraction = Math.max(0.005, overall_percent / 100);
        const wallEta = elapsedWall * ((1 - fraction) / fraction);
        let rawEta = -1;

        if (total_passes === 2) {
          if (pass === 1 && effSpeed > 0.01) {
            const pass1Rem = Math.max(0, total_secs - current_secs) / effSpeed;
            const pass2Est = (total_secs / effSpeed) * 1.1;
            const speedEta = pass1Rem + pass2Est;
            rawEta = fraction >= 0.08 ? (0.6 * speedEta + 0.4 * wallEta) : speedEta;
          } else if (pass === 2 && effSpeed > 0.01) {
            const pass2Rem = Math.max(0, total_secs - current_secs) / effSpeed;
            rawEta = (0.7 * pass2Rem) + (0.3 * wallEta);
          } else {
            rawEta = wallEta;
          }
        } else {
          const mediaRem = Math.max(0, total_secs - current_secs);
          if (effSpeed > 0.01) {
            const speedEta = mediaRem / effSpeed;
            rawEta = fraction >= 0.03 ? (0.65 * speedEta + 0.35 * wallEta) : speedEta;
          } else {
            rawEta = wallEta;
          }
        }

        if (rawEta >= 0 && Number.isFinite(rawEta)) {
          const prev = lastEtaRef.current;
          const dampedEta = (prev > 0 && Math.abs(rawEta - prev) < prev * 0.5)
            ? (prev * 0.7) + (rawEta * 0.3)
            : rawEta;
          lastEtaRef.current = dampedEta;
          setTimeLeft(`${passPrefix}${formatTime(Math.max(1, Math.round(dampedEta)))}`);
        }
      });

      unlistenEnhance = await listen("enhance-progress", async (event) => {
        if (appMode !== 'enhance') return;
        const line = event.payload;

        if (line.startsWith("Turbo Engine Adjusted:")) {
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
          }
          return;
        }

        if (line.startsWith("Prep: Finalized:")) {
          const actual = parseInt(line.split(":")[2]);
          totalPrepFrames.current = actual;
          setProgress(10);
          rawProgress.set(10);
          setTimeLeft(`GPU Ready: Launching Turbo Engine...`);
          return;
        }

        if (line.startsWith("Prep: Active:")) {
          const msg = line.replace("Prep: Active:", "");
          setTimeLeft(msg);
          return;
        }

        if (line.startsWith("Prep:")) {
          return;
        }

        const match = line.match(/([\d.]+)%/);
        if (match) {
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
        }
      });
    };

    setupListeners();

    return () => {
      if (unlistenTelemetry) unlistenTelemetry();
      if (unlistenEnhance) unlistenEnhance();
    };
  }, [appMode, formatTime, rawProgress]);

  useEffect(() => {
    if (successData && successScope.current) {
      animateSuccess(successScope.current, 
        { scale: [1, 1.05, 1], boxShadow: ["0 0 0px rgba(138,162,130,0)", "0 0 40px rgba(138,162,130,0.32)", "0 0 0px rgba(138,162,130,0)"] },
        { duration: 0.8, times: [0, 0.5, 1] }
      );
    }
  }, [successData, animateSuccess, successScope]);

  const processFiles = useCallback(async (paths, currentMode) => {
    const validExtensions = ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'tiff', 'mp4', 'mkv', 'avi', 'mov', 'webm', 'flv', 'wmv', 'm4v', 'ts', 'ogv', 'gif', 'mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg', 'opus', 'wma'];
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

    setProgress(0); setTimeLeft(null);
    smoothedSpeedRef.current = 0; lastEtaRef.current = 0; setDimSettings({ width: "", height: "" });
  }, [getFileType]);

  useEffect(() => {
    invoke("take_startup_files")
      .then((files) => {
        if (Array.isArray(files) && files.length > 0) {
          setShowIntro(false);
          processFiles(files, appMode);
        }
      })
      .catch(() => {});
  }, [appMode, processFiles]);

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
      filters: [{ name: 'Media', extensions: ['jpg', 'jpeg', 'png', 'webp', 'mp4', 'mkv', 'avi', 'mov', 'webm', 'mp3', 'wav', 'flac', 'm4a', 'ogg'] }]
    });
    if (selected && selected.length > 0) {
      processFiles(selected, appMode);
    }
  }, [appMode, processFiles]);

  const stopJob = useCallback(async () => {
    try {
      await invoke("stop_job");
      isStoppingRef.current = true;
      isBatchPoolRef.current = false;
      activeJobProgressRef.current = {};
      setIsProcessing(false);
      setTimeLeft("PROCESS HALTED");
      setProgress(0);
      rawProgress.set(0);
      setFileQueue(prev => prev.map(f => f.status === 'processing' ? {...f, status: 'queued'} : f));
    } catch (e) {
      console.error("Stop failed:", e);
    }
  }, [rawProgress]);

  const startJob = useCallback(async () => {
    isStoppingRef.current = false;
    setProgress(0); setTimeLeft(null);
    if (fileQueue.length === 0) return;

    setIsProcessing(true);
    setProgress(0); rawProgress.set(0); setTimeLeft(null);
    smoothedSpeedRef.current = 0; lastEtaRef.current = 0;

    let outputFolder = "";
    let singleSavePath = "";

    if (fileQueue.length === 1) {
      const file = fileQueue[0];
      let targetExt = (appMode === "enhance" && file.type === "VID") ? "mp4" : 
                        (appMode === "enhance" && file.type === "IMG") ? aiFormat : file.ext;
      if (appMode === "compress" && targetSizeEnabled && targetFormat !== "same") targetExt = targetFormat;
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

    let localSuccessCount = 0; 
    let thisRunOrig = 0;
    let thisRunComp = 0;

    const buildFinalPath = (file, idx) => {
      if (fileQueue.length === 1) return singleSavePath;
      let targetExt = file.ext;
      if (appMode === "enhance" && file.type === "VID") targetExt = "mp4";
      if (appMode === "enhance" && file.type === "IMG") targetExt = aiFormat;
      if (appMode === "compress" && targetSizeEnabled && targetFormat !== "same") targetExt = targetFormat;

      const prefix = appMode === "enhance" ? "enhanced" : "compressed";
      const baseName = file.name.substring(0, file.name.lastIndexOf('.'));
      const separator = outputFolder.includes('\\') ? '\\' : '/';
      return `${outputFolder}${separator}${baseName}_${prefix}_${Date.now()}_${idx}.${targetExt}`;
    };

    const pendingIndices = fileQueue
      .map((f, idx) => (f.status !== 'done' ? idx : -1))
      .filter((idx) => idx !== -1);

    const isPureImageBatch = appMode === "compress"
      && pendingIndices.length > 1
      && pendingIndices.every((idx) => fileQueue[idx].type === 'IMG');

    const isDualEngineVideoBatch = appMode === "compress"
      && pendingIndices.length > 1
      && !targetSizeEnabled
      && useGpu
      && hwInfo.can_dual_engine
      && pendingIndices.every((idx) => fileQueue[idx].type === 'VID');

    if (isPureImageBatch) {
      isBatchPoolRef.current = true;
      batchTotalCountRef.current = pendingIndices.length;
      batchCompletedRef.current = 0;
      activeJobProgressRef.current = {};
      compressStartTimeRef.current = Date.now();

      let cursor = 0;
      const totalInBatch = pendingIndices.length;
      const CONCURRENCY = Math.min(3, totalInBatch);
      setTimeLeft(`0 / ${totalInBatch} Images`);

      const worker = async () => {
        while (!isStoppingRef.current) {
          const myPos = cursor++;
          if (myPos >= pendingIndices.length) break;
          const idx = pendingIndices[myPos];
          const file = fileQueue[idx];
          const outPath = buildFinalPath(file, idx);

          setFileQueue(prev => prev.map((f, j) => j === idx ? { ...f, status: 'processing' } : f));
          let origSize = 0;
          try { origSize = await invoke("get_file_size", { path: file.path }); } catch (_) {}

          try {
            if (targetSizeEnabled && targetSize) {
              let targetKb = parseFloat(targetSize);
              if (targetSizeUnit === "MB") targetKb *= 1024;
              if (targetSizeUnit === "GB") targetKb *= 1024 * 1024;
              await invoke("compress_image_target_size", { input: file.path, output: outPath, targetSizeKb: targetKb, width: dimSettings.width || "0", height: dimSettings.height || "0" });
            } else {
              await invoke("compress_image", { input: file.path, output: outPath, width: dimSettings.width || "0", height: dimSettings.height || "0" });
            }
            let compSize = 0;
            try { compSize = await invoke("get_file_size", { path: outPath }); } catch (_) {}
            localSuccessCount++;
            thisRunOrig += origSize;
            thisRunComp += compSize;
            setFileQueue(prev => prev.map((f, j) => j === idx ? { ...f, status: 'done', finalPath: outPath, origSize, compSize } : f));
          } catch (e) {
            console.error(e);
            setFileQueue(prev => prev.map((f, j) => j === idx ? { ...f, status: 'error' } : f));
            setErrorToast(String(e));
          } finally {
            batchCompletedRef.current += 1;
            const doneNow = batchCompletedRef.current;
            const pct = Math.round((doneNow / totalInBatch) * 100);
            setProgress(pct);
            rawProgress.set(pct);
            const elapsed = (Date.now() - compressStartTimeRef.current) / 1000;
            if (doneNow < totalInBatch && elapsed > 0.3) {
              const eta = (elapsed / doneNow) * (totalInBatch - doneNow);
              setTimeLeft(`${doneNow}/${totalInBatch} · ${formatTime(Math.max(1, Math.round(eta)))}`);
            }
          }
        }
      };

      await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
      isBatchPoolRef.current = false;
    } else if (isDualEngineVideoBatch) {
      // Hybrid Dual-Engine Batch: Worker 0 drives dGPU NVENC, Worker 1 drives tuned CPU x265 concurrently
      isBatchPoolRef.current = true;
      batchTotalCountRef.current = pendingIndices.length;
      batchCompletedRef.current = 0;
      activeJobProgressRef.current = {};
      compressStartTimeRef.current = Date.now();

      let cursor = 0;
      const totalInBatch = pendingIndices.length;
      setTimeLeft(`Dual-Engine · 0/${totalInBatch}`);

      const runDualWorker = async (workerUseGpu) => {
        while (!isStoppingRef.current) {
          const myPos = cursor++;
          if (myPos >= pendingIndices.length) break;
          const idx = pendingIndices[myPos];
          const file = fileQueue[idx];
          const outPath = buildFinalPath(file, idx);
          const jid = `vid_${idx}`;

          setFileQueue(prev => prev.map((f, j) => j === idx ? { ...f, status: 'processing' } : f));
          let origSize = 0;
          try { origSize = await invoke("get_file_size", { path: file.path }); } catch (_) {}

          try {
            await invoke("compress_video", { input: file.path, output: outPath, autoGpu: workerUseGpu, jobId: jid });
            let compSize = 0;
            try { compSize = await invoke("get_file_size", { path: outPath }); } catch (_) {}
            localSuccessCount++;
            thisRunOrig += origSize;
            thisRunComp += compSize;
            setFileQueue(prev => prev.map((f, j) => j === idx ? { ...f, status: 'done', finalPath: outPath, origSize, compSize } : f));
          } catch (e) {
            console.error(e);
            setFileQueue(prev => prev.map((f, j) => j === idx ? { ...f, status: 'error' } : f));
            setErrorToast(String(e));
          } finally {
            delete activeJobProgressRef.current[jid];
            batchCompletedRef.current += 1;
            if (batchCompletedRef.current >= totalInBatch) {
              setProgress(100);
              rawProgress.set(100);
            }
          }
        }
      };

      await Promise.all([runDualWorker(true), runDualWorker(false)]);
      isBatchPoolRef.current = false;
      activeJobProgressRef.current = {};
    } else {
      isBatchPoolRef.current = false;
      for (const i of pendingIndices) {
        if (isStoppingRef.current) break;
        const file = fileQueue[i];

        setCurrentIndex(i);
        setFileQueue(prev => prev.map((f, idx) => idx === i ? {...f, status: 'processing'} : f));
        
        if (file.type === 'DOC') {
           setFileQueue(prev => prev.map((f, idx) => idx === i ? {...f, status: 'error'} : f));
           continue;
        }

        const finalPath = buildFinalPath(file, i);

        let originalFileSize = 0;
        try {
          originalFileSize = await invoke("get_file_size", { path: file.path });
        } catch (e) {
          console.error("Could not get original file size", e);
        }

        try {
          if (appMode === "enhance") {
            enhanceStartTimeRef.current = Date.now();
            if (file.type === 'VID') {
                setProgress(0); setTimeLeft("Preparing AI Models...");
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
                setProgress(0); setTimeLeft("Warming up GPU & Processing...");
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
            compressStartTimeRef.current = Date.now();
            lastEtaRef.current = 0;
            smoothedSpeedRef.current = 0;
            setProgress(0); rawProgress.set(0); setTimeLeft("Calculating...");
            if (targetSizeEnabled && targetSize) {
               let targetKb = parseFloat(targetSize);
               if (targetSizeUnit === "MB") targetKb *= 1024;
               if (targetSizeUnit === "GB") targetKb *= 1024 * 1024;
               
               if (file.type === 'IMG') {
                  await invoke("compress_image_target_size", { input: file.path, output: finalPath, targetSizeKb: targetKb, width: dimSettings.width || "0", height: dimSettings.height || "0" });
               } else if (file.type === 'AUD') {
                  await invoke("compress_audio", { input: file.path, output: finalPath, jobId: "single" });
               } else {
                  await invoke("compress_video_target_size", { input: file.path, output: finalPath, targetSizeKb: targetKb, autoGpu: useGpu, jobId: "single" });
               }
            } else {
               if (file.type === 'IMG') {
                 await invoke("compress_image", { input: file.path, output: finalPath, width: dimSettings.width || "0", height: dimSettings.height || "0" });
               } else if (file.type === 'AUD') {
                 await invoke("compress_audio", { input: file.path, output: finalPath, jobId: "single" });
               } else {
                 await invoke("compress_video", { input: file.path, output: finalPath, autoGpu: useGpu, jobId: "single" });
               }
            }
          }
          
          setProgress(100);
          rawProgress.set(100);
          let compressedFileSize = 0;
          try { compressedFileSize = await invoke("get_file_size", { path: finalPath }); } catch (e) {}

          localSuccessCount++; 
          thisRunOrig += originalFileSize;
          thisRunComp += compressedFileSize;
          setFileQueue(prev => prev.map((f, idx) => idx === i ? {...f, status: 'done', finalPath: finalPath, origSize: originalFileSize, compSize: compressedFileSize} : f));

        } catch (e) {
          console.error(e);
          setFileQueue(prev => prev.map((f, idx) => idx === i ? {...f, status: 'error'} : f));
          setErrorToast(String(e));
        }
      }
    }

    setIsProcessing(false); setTimeLeft(null); setCurrentIndex(null);
    const savedLocation = fileQueue.length === 1 ? singleSavePath : outputFolder;
    if (localSuccessCount > 0) {
        setSuccessData({ count: localSuccessCount, path: savedLocation, origSize: thisRunOrig, compSize: thisRunComp });
    }
  }, [fileQueue, appMode, aiFormat, aiScale, aiVideoModel, aiFps, useGpu, hwInfo, denoise, stabilize, hyperDetail, faceRestore, tileSize, dimSettings, targetSizeEnabled, targetSize, targetSizeUnit, targetFormat, rawProgress, formatTime]);

  const viewComparison = useCallback(async (file) => {
    setSliderPos(50);
    sliderX.set(50);
    if (!file.finalPath || file.type !== 'IMG') return;
    
    setOriginalImgSrc(""); setEnhancedImgSrc("");
    
    try {
      const origBytes = await invoke("read_file_bytes", { path: file.path });
      const enhBytes = await invoke("read_file_bytes", { path: file.finalPath });
      
      setOriginalImgSrc(URL.createObjectURL(new Blob([new Uint8Array(origBytes)])));
      setEnhancedImgSrc(URL.createObjectURL(new Blob([new Uint8Array(enhBytes)])));
      setShowComparison(true);
    } catch (e) {
      console.error("Could not load preview:", e);
      setErrorToast("Could not load preview.");
    }
  }, [sliderX]);

  const removeFile = useCallback((indexToRemove) => {
    setFileQueue(prev => {
      const newQueue = prev.filter((_, i) => i !== indexToRemove);
      if (newQueue.length === 0) {
        setProgress(0);
      }
      return newQueue;
    });
  }, []);

  const clearAll = useCallback(() => {
      setFileQueue([]); setProgress(0);
  }, []);

  const closeComparison = useCallback(() => {
    setShowComparison(false);
    if (originalImgSrc) URL.revokeObjectURL(originalImgSrc);
    if (enhancedImgSrc) URL.revokeObjectURL(enhancedImgSrc);
    setOriginalImgSrc(""); setEnhancedImgSrc("");
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
      className="relative min-h-screen w-full flex items-center justify-center p-4 md:p-8 overflow-hidden selection:bg-studio-sage/30"
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
        className={`relative z-10 w-full max-w-xl studio-glass p-3 flex flex-col shadow-studio-2xl border transition-all duration-700 ${isDarkMode ? 'border-[#8AA282]/15 bg-studio-obsidian/50' : 'border-[#E2DFD5] bg-[#FAF9F5]/75'}`}
      >
        <motion.div
          variants={{
            hidden: { opacity: 0, y: -10 },
            visible: { opacity: 1, y: 0 }
          }}
          className="flex-none mb-2"
        >
          <DashboardHeader appMode={appMode} isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} isProcessing={isProcessing} updater={updater} stats={{ compressedSize: "0", originalSize: "0", totalFiles: fileQueue.length }} />
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
                      ? 'bg-studio-obsidian/45 border-[#8AA282]/18 hover:border-studio-sage/50 hover:bg-studio-sage/8' 
                      : 'bg-[#F5F3EC]/90 border-[#D9D5C9] hover:border-studio-olive/45 hover:bg-[#EFECE4] shadow-sm'
                  }`}
                >
                   <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-700 group-hover:rotate-90 group-hover:scale-110 ${
                     isDarkMode ? 'bg-studio-sage/15 text-studio-moss' : 'bg-[#FAF9F5] text-studio-forest shadow-md border border-[#E4E0D5]'
                   }`}>
                      <Icon name="plus" className="w-4 h-4" stroke={2.5} />
                   </div>
                   <div className="text-center px-4">
                      <p className={`text-[9px] font-black uppercase tracking-widest ${isDarkMode ? 'text-[#DCD9CF]' : 'text-[#394135]'}`}>
                        Select or Drop Media
                      </p>
                   </div>
                </div>
              </motion.div>
            ) : (
              <motion.div key="queue" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col gap-2">
                 <div className="flex justify-between items-center px-2">
                  <span className={`text-[9px] font-black uppercase tracking-widest ${isDarkMode ? 'text-[#9DA498]' : 'text-[#6A7164]'}`}>
                    {fileQueue.length} {fileQueue.length === 1 ? 'FILE' : 'FILES'} QUEUED
                  </span>
                  <button onClick={clearAll} disabled={isProcessing} className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-[#B85442] hover:text-[#9A3F30] transition-colors disabled:opacity-30">
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
             hwInfo={hwInfo}
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
             targetSizeEnabled={targetSizeEnabled}
             setTargetSizeEnabled={setTargetSizeEnabled}
             targetSize={targetSize}
             setTargetSize={setTargetSize}
             targetSizeUnit={targetSizeUnit}
             setTargetSizeUnit={setTargetSizeUnit}
             targetFormat={targetFormat}
             setTargetFormat={setTargetFormat}
          />
        </motion.section>
      </motion.main>

      <AnimatePresence>
        {showComparison && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={`fixed inset-0 z-[50000] backdrop-blur-2xl flex flex-col p-8 ${isDarkMode ? 'bg-studio-obsidian/95' : 'bg-studio-cream/95'}`}>
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
            className={`fixed inset-0 z-[10000] flex justify-center p-2 sm:p-4 overflow-y-auto ${isDarkMode ? 'bg-[#0E130F]/85 backdrop-blur-md' : 'bg-[#1D241C]/45 backdrop-blur-md'}`}
          >
            <motion.div 
               ref={successScope}
               initial={{ y: 30, opacity: 0, scale: 0.95 }} 
               animate={{ y: 0, opacity: 1, scale: 1 }}
               exit={{ y: 20, opacity: 0, scale: 0.95 }}
               transition={{ type: "spring", stiffness: 350, damping: 25 }}
               className={`relative max-w-lg w-full my-auto studio-glass p-5 sm:p-6 flex flex-col items-center text-center shadow-studio-2xl border ${isDarkMode ? 'border-white/20' : 'border-white/60'} rounded-[2rem] overflow-hidden`}
            >
               {/* Ambient Glow Background inside the card */}
               <div className="absolute top-0 inset-x-0 h-32 bg-gradient-to-b from-white/10 to-transparent pointer-events-none" />

               <motion.div 
                  initial={{ scale: 0, rotate: -45 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", delay: 0.1 }}
                  className={`w-16 h-16 rounded-full flex items-center justify-center mb-3 shadow-lg z-10 ${
                  appMode === 'compress' 
                  ? 'bg-gradient-to-br from-studio-olive to-studio-forest shadow-[0_8px_24px_rgba(66,79,60,0.38)]' 
                  : 'bg-gradient-to-br from-[#747B4D] to-studio-olive shadow-[0_8px_24px_rgba(102,107,84,0.35)]'
               }`}>
                  <Icon 
                    name={appMode === 'compress' ? 'compressLogo' : 'sparkles'} 
                    className="w-8 h-8 text-white" 
                    stroke={1.5} 
                  />
               </motion.div>
               
               <motion.h2 
                 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
                 className={`text-2xl font-black mb-1 italic uppercase tracking-widest z-10 ${isDarkMode ? 'text-white drop-shadow-md' : 'text-slate-900 drop-shadow-sm'}`}>
                 {appMode === 'compress' ? 'Compressed' : 'Enhanced'}
               </motion.h2>
               
               <motion.p 
                 initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
                 className={`mb-4 font-semibold text-xs z-10 ${isDarkMode ? 'text-white/80' : 'text-slate-600'}`}>
                 {successData.count} {successData.count === 1 ? 'asset has' : 'assets have'} been successfully processed.
               </motion.p>

               {successData.origSize && successData.compSize && appMode === 'compress' && (() => {
                  const savedBytes = successData.origSize - successData.compSize;
                  const savedMB = savedBytes / (1024 * 1024);
                  const savedPercent = Math.max(0, Math.round((savedBytes / successData.origSize) * 100));
                  const origMB = (successData.origSize / (1024 * 1024)).toFixed(2);
                  const compMB = (successData.compSize / (1024 * 1024)).toFixed(2);

                  const metrics = [
                    { value: Math.floor(savedMB / 3.5), label: "high-res photos" },
                    { value: Math.floor(savedMB / 3.5), label: "MP3 songs" },
                    { value: Math.floor(savedMB / 1.5), label: "PDF documents" },
                    { value: Math.floor(savedMB / 1),   label: "WhatsApp voice notes" },
                    { value: Math.floor(savedMB / 150), label: "minutes of 1080p video" }
                  ];
                  const funMetric = metrics.filter(m => m.value >= 1).sort((a, b) => b.value - a.value)[0];

                  return (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
                      className="w-full mb-4 z-10"
                    >
                       <div className={`p-4 rounded-[1.5rem] border text-left flex flex-col gap-2 relative overflow-hidden shadow-inner ${isDarkMode ? 'bg-white/5 border-[#8AA282]/15' : 'bg-[#F2F0EB] border-[#DFDCD2]'}`}>
                          
                          <div className="flex justify-between items-center">
                             <span className={`text-[9px] font-black uppercase tracking-widest opacity-60 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Original</span>
                             <span className={`text-xs font-bold font-mono ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>{origMB} MB</span>
                          </div>
                          <div className="flex justify-between items-center">
                             <span className={`text-[9px] font-black uppercase tracking-widest opacity-60 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Compressed</span>
                             <span className={`text-base font-black font-mono drop-shadow-sm ${isDarkMode ? 'text-studio-moss' : 'text-studio-forest'}`}>
                                <NumberFlow value={parseFloat(compMB)} format={{ minimumFractionDigits: 1, maximumFractionDigits: 1 }} /> MB
                             </span>
                          </div>
                          <div className="flex justify-between items-center">
                             <span className={`text-[9px] font-black uppercase tracking-widest opacity-60 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>You Saved</span>
                             <span className={`text-xs font-bold font-mono ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                                <NumberFlow value={parseFloat(savedMB.toFixed(1))} /> MB ({savedPercent}%)
                             </span>
                          </div>
                          
                          <div className="w-full h-1.5 bg-black/10 rounded-full mt-1 overflow-hidden relative">
                             <motion.div 
                               initial={{ width: "0%" }}
                               animate={{ width: `${savedPercent}%` }}
                               transition={{ duration: 1.2, ease: "easeOut", delay: 0.6 }}
                               className="absolute left-0 top-0 h-full bg-gradient-to-r from-studio-forest via-studio-olive to-studio-sage shadow-[0_0_8px_rgba(138,162,130,0.6)] rounded-full"
                             />
                          </div>
                       </div>
                       
                       {funMetric && (
                          <motion.div 
                            initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.8, type: "spring" }}
                            className={`mt-3 px-3 py-2 rounded-xl border flex items-center justify-center gap-2 shadow-sm ${isDarkMode ? 'bg-studio-sage/12 border-studio-sage/30 text-studio-moss' : 'bg-[#EAEFE6] border-[#CED7C7] text-studio-forest'}`}>
                             <motion.div animate={{ rotate: [0, 15, -15, 0] }} transition={{ repeat: Infinity, duration: 2, repeatDelay: 1 }}>
                               <Icon name="lightbulb" className="w-4 h-4 flex-shrink-0 drop-shadow-md" />
                             </motion.div>
                             <span className="text-[11px] font-semibold leading-tight text-center">
                                You saved enough space for <strong className="font-black text-xs"><NumberFlow value={funMetric.value} /> {funMetric.label}</strong>
                             </span>
                          </motion.div>
                       )}
                    </motion.div>
                  );
               })()}

               <div className="flex gap-3 w-full mt-2 z-10">
                   <motion.button
                      initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.5 }}
                      onClick={async () => {
                         try {
                            await invoke("show_in_folder", { path: successData.path });
                         } catch (e) {
                            console.error('Failed to open folder:', e);
                         }
                      }}
                      className={`flex-1 p-3 rounded-[1rem] border flex items-center justify-center gap-2 group cursor-pointer transition-all hover:scale-[1.02] active:scale-95 ${isDarkMode ? 'bg-white/5 border-white/10 hover:bg-white/10' : 'bg-slate-50 border-slate-200 hover:bg-white hover:shadow-md'}`}
                   >
                      <Icon name="folder" className={`w-4 h-4 ${isDarkMode ? 'text-slate-400 group-hover:text-slate-200' : 'text-slate-500 group-hover:text-slate-700'}`} stroke={2} />
                      <span className={`text-[10px] font-black uppercase tracking-widest ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>Show File</span>
                   </motion.button>
    
                   <motion.button 
                     initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.5 }}
                     onClick={() => setSuccessData(null)} 
                     className={`flex-1 p-3 rounded-[1rem] font-black uppercase tracking-widest text-[10px] flex items-center justify-center hover:scale-[1.02] active:scale-95 transition-all shadow-lg ${
                       isDarkMode ? 'bg-[#F2F0EB] text-[#1D241C] hover:shadow-white/15' : 'bg-studio-forest text-[#FAF9F5] hover:bg-studio-olive shadow-[0_8px_20px_rgba(66,79,60,0.28)]'
                     }`}
                   >
                     DONE
                   </motion.button>
               </div>
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
              isDarkMode ? 'bg-[#0E130F]/92' : 'bg-studio-moss/20'
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
                      isDarkMode ? 'border-studio-sage' : 'border-studio-forest'
                    }`} 
                 />
                 {/* Top Right */}
                 <motion.div 
                    animate={{ x: [2, 0, 2], y: [-2, 0, -2], opacity: [0.3, 0.6, 0.3] }}
                    transition={{ duration: 4, repeat: Infinity }}
                    className={`absolute top-0 right-0 w-14 h-14 border-t-2 border-r-2 shadow-[0_0_15px_rgba(255,255,255,0.05)] ${
                      isDarkMode ? 'border-studio-sage' : 'border-studio-forest'
                    }`} 
                 />
                 {/* Bottom Left */}
                 <motion.div 
                    animate={{ x: [-2, 0, -2], y: [2, 0, 2], opacity: [0.3, 0.6, 0.3] }}
                    transition={{ duration: 4, repeat: Infinity }}
                    className={`absolute bottom-0 left-0 w-14 h-14 border-b-2 border-l-2 shadow-[0_0_15px_rgba(255,255,255,0.05)] ${
                      isDarkMode ? 'border-studio-sage' : 'border-studio-forest'
                    }`} 
                 />
                 {/* Bottom Right */}
                 <motion.div 
                    animate={{ x: [2, 0, 2], y: [2, 0, 2], opacity: [0.3, 0.6, 0.3] }}
                    transition={{ duration: 4, repeat: Infinity }}
                    className={`absolute bottom-0 right-0 w-14 h-14 border-b-2 border-r-2 shadow-[0_0_15px_rgba(255,255,255,0.05)] ${
                      isDarkMode ? 'border-studio-sage' : 'border-studio-forest'
                    }`} 
                 />

                 {/* Center Tech Badge */}
                 <div className="flex flex-col items-center gap-6">
                    <div className={`w-28 h-28 rounded-3xl flex items-center justify-center border border-white/20 studio-glass shadow-2xl ${
                      isDarkMode 
                      ? 'bg-white/5 shadow-[0_0_40px_rgba(0,0,0,0.5)]' 
                      : 'bg-studio-sage/18'
                    }`}>
                      <Icon name="studioUpload" className={`w-12 h-12 ${
                        isDarkMode ? 'text-studio-moss' : 'text-studio-forest'
                      } ${isDarkMode ? 'brightness-125' : ''}`} stroke={1.2} />
                    </div>
                    
                    <div className="flex flex-col items-center">
                       <h2 className={`text-3xl font-black uppercase tracking-[0.3em] text-center ${
                         isDarkMode ? 'text-white' : 'text-slate-900'
                       } ${
                         'drop-shadow-[0_0_20px_rgba(138,162,130,0.45)]'
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

      <ErrorToast error={errorToast} isDarkMode={isDarkMode} onDismiss={() => setErrorToast(null)} />
      <EngineSetupModal isDarkMode={isDarkMode} runtime={ffmpegRuntime} />
      <UpdaterModal isDarkMode={isDarkMode} updater={updater} />
    </div>
  );
}
