import React, { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Icon from "./Icon";
import MotionToggle from "./MotionToggle";
import MotionSelect from "./MotionSelect";

const ToggleItem = ({ active, label, onClick, isDarkMode, icon }) => (
  <button 
    onClick={onClick} 
    className={`flex items-center justify-between gap-3 px-4 py-3 rounded-2xl border transition-all ${
      active 
        ? 'bg-studio-rose/10 border-studio-rose/30 text-studio-rose shadow-studio-sm' 
        : (isDarkMode ? 'bg-white/5 border-white/5 text-slate-500 hover:bg-white/10' : 'bg-slate-100 border-slate-200 text-slate-500 hover:bg-slate-200 shadow-sm')
    }`}
  >
     <div className="flex items-center gap-2">
        <Icon name={icon} className="w-3 h-3" />
        <span className="text-[9px] font-black uppercase tracking-widest">{label}</span>
     </div>
     <div className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-studio-rose animate-pulse' : 'bg-slate-700'}`} />
  </button>
);

const SettingsDeck = React.memo(({
  isDarkMode,
  appMode,
  hasImages,
  hasVideos,
  useGpu,
  setUseGpu,
  dimSettings,
  setDimSettings,
  aiVideoModel,
  setAiVideoModel,
  aiFormat,
  setAiFormat,
  aiScale,
  setAiScale,
  aiFps,
  setAiFps,
  faceRestore,
  setFaceRestore,
  hyperDetail,
  setHyperDetail,
  denoise,
  setDenoise,
  stabilize,
  setStabilize,
  tileSize,
  setTileSize,
  quality,
  setQuality,
  showAdvanced,
  setShowAdvanced,
  isProcessing,
  startJob,
  stopJob,
  progress,
  timeLeft
}) => {
  const [activeInfo, setActiveInfo] = useState(null);

  const toggleInfo = useCallback((id) => {
    setActiveInfo(prev => prev === id ? null : id);
  }, []);

  const explanations = {
    style: "Enhancement Style: Choose the look of the AI engine. 'Cinema' is best for movies, 'Anime' for drawings/CGI.",
    size: "Size Boost: Multiplies the pixel count (Resolution). 4X turns HD into 4K.",
    motion: "Motion Smoothness: Generates new frames to make video playback feel fluid and less choppy.",
    faces: "Fix Faces: Specifically targets and repairs blurry or pixelated facial features for a clear look.",
    sharp: "Deep Sharpness: Uses Neural AI to clarify fine textures like skin, fabric, and landscapes.",
    grain: "Clean Grain: Removes digital 'noise' and flickering artifacts from low-light or old footage.",
    shake: "Fix Shake: Smoothly counteracts shaky camera movements for a more professional presentation.",
    size_target: "Target Size: Manually set the pixel dimensions. This resizes your image exactly to these width/height values.",
    output: "Optimization Lab: Pick your file format. WebP is smallest for web, PNG is lossless, and JPG is for compatibility.",
    tile: "Tile Overlap: Adjusts how AI pieces the image together. Higher values prevent 'seam' lines but use more VRAM.",
    quality_crf: "Quality Index (CRF): 18 is visually lossless, 24 is standard, 30+ is heavy compression. Lower is better quality."
  };

  const renderInfoToggle = (id, color = "text-slate-500") => (
    <button 
      onClick={(e) => { e.stopPropagation(); toggleInfo(id); }}
      className={`p-1 rounded-full transition-all hover:bg-white/10 ${
        activeInfo === id 
        ? (isDarkMode ? 'bg-white/20 scale-110' : 'bg-slate-200 scale-110 shadow-sm') 
        : 'opacity-40 hover:opacity-100'
      }`}
    >
      <Icon 
        name="info" 
        className={`w-3 h-3 ${
          activeInfo === id 
          ? (isDarkMode ? 'text-white' : 'text-slate-900') 
          : color
        }`} 
      />
    </button>
  );

  const renderInfoCard = (id) => (
    <AnimatePresence mode="wait">
      {activeInfo === id && (
        <motion.div 
          key={id}
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="overflow-hidden"
        >
          <div className={`mt-2 p-3 rounded-2xl text-[10px] leading-relaxed font-bold border ${isDarkMode ? 'bg-white/5 border-white/5 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-600'}`}>
             {explanations[id]}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  const renderActionButton = () => (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={isProcessing ? stopJob : startJob}
      className={`w-full py-4 mt-auto rounded-2xl text-[10px] font-black uppercase tracking-[0.3em] transition-all shadow-xl flex items-center justify-center gap-3 border ${
        isProcessing 
        ? (isDarkMode ? 'bg-slate-800/50 border-white/5 text-slate-500' : 'bg-slate-100 border-slate-200 text-slate-400') 
        : (appMode === 'compress' 
           ? 'bg-studio-violet border-studio-violet/50 text-white shadow-studio-violet/30' 
           : 'bg-gradient-to-r from-studio-violet to-studio-rose border-white/10 text-white shadow-studio-rose/30')
      }`}
    >
       <div className={`w-1.5 h-1.5 rounded-full ${isProcessing ? 'bg-amber-400 animate-pulse' : 'bg-white'}`} />
        <div className="flex flex-col items-center text-center">
           <span className="text-[10px] font-black">
             {isProcessing 
               ? `STOP (${Math.round(progress)}%)` 
               : (appMode === 'compress' ? 'START COMPRESS' : 'START TURBO ENHANCE')}
           </span>
           {isProcessing && timeLeft && (
             <span className="text-[8px] opacity-60 font-bold mt-0.5 whitespace-nowrap">{timeLeft} REMAINING</span>
           )}
        </div>
    </motion.button>
  );

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.05,
        delayChildren: 0.1
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20, filter: "blur(10px)" },
    visible: { 
      opacity: 1, 
      y: 0, 
      filter: "blur(0px)",
      transition: { type: "spring", stiffness: 200, damping: 22 }
    }
  };

  return (
    <motion.div 
       layout
       variants={containerVariants}
       initial="hidden"
       animate="visible"
       className="mt-1 flex flex-col items-center w-full"
    >
      <div className={`w-full flex flex-col gap-1.5 p-2.5 rounded-xl border transition-all duration-700 ${
        isDarkMode ? 'bg-studio-obsidian/60 border-white/5 shadow-2xl' : 'bg-white/80 border-slate-200 shadow-lg'
      }`}>
        
        {/* Row 1: Core Acceleration (Only for Compression) */}
        {appMode === "compress" && (
          <>
            <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-1.5">
                  <Icon name="cpu" className="w-2.5 h-2.5 text-studio-violet" />
                  <span className={`text-[9px] font-black uppercase tracking-widest ${isDarkMode ? 'text-slate-300' : 'text-slate-800'}`}>GPU ACCELERATION</span>
                </div>
                <MotionToggle checked={useGpu} onChange={setUseGpu} isDarkMode={isDarkMode} />
            </div>

            <div className={`h-px w-full ${isDarkMode ? 'bg-white/5' : 'bg-slate-100'}`} />
          </>
        )}

        {/* Row 2: Media Specific Settings */}
        {appMode === "compress" ? (
          <>
             {hasImages && (
                <div className="flex flex-col gap-1">
                   <label className={`text-[7px] font-black uppercase tracking-[0.1em] px-1 opacity-40 ${isDarkMode ? 'text-slate-100' : 'text-slate-900'}`}>Output Dimensions</label>
                   <div className="grid grid-cols-2 gap-1.5">
                       <input 
                         type="number" 
                         placeholder="WIDTH" 
                         value={dimSettings.width} 
                         onChange={(e) => setDimSettings({...dimSettings, width: e.target.value})} 
                         className={`w-full bg-transparent border rounded-md px-2 py-1.5 text-[10px] outline-none focus:ring-1 focus:ring-studio-violet/30 transition-all font-bold ${isDarkMode ? 'border-white/5 text-slate-100 placeholder:text-slate-700' : 'border-slate-200 text-slate-900 placeholder:text-slate-400'}`} 
                       />
                       <input 
                         type="number" 
                         placeholder="HEIGHT" 
                         value={dimSettings.height} 
                         onChange={(e) => setDimSettings({...dimSettings, height: e.target.value})} 
                         className={`w-full bg-transparent border rounded-md px-2 py-1.5 text-[10px] outline-none focus:ring-1 focus:ring-studio-violet/30 transition-all font-bold ${isDarkMode ? 'border-white/5 text-slate-100 placeholder:text-slate-700' : 'border-slate-200 text-slate-900 placeholder:text-slate-400'}`} 
                       />
                   </div>
                </div>
             )}
          </>
        ) : (
          <div className="flex flex-col gap-1.5">
             <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-0.5">
                   <div className="flex items-center justify-between px-1">
                      <label className={`text-[7px] font-black uppercase tracking-[0.1em] opacity-40 ${isDarkMode ? 'text-slate-300' : 'text-slate-800'}`}>MODEL</label>
                      {renderInfoToggle("style")}
                   </div>
                   <MotionSelect 
                      value={aiVideoModel} isDarkMode={isDarkMode} 
                      onChange={setAiVideoModel} 
                      options={[
                        { value: "anime", label: "Anime" },
                        { value: "man-photo", label: "Realism" },
                        { value: "cinema", label: "Cinema" }
                      ]} 
                   />
                </div>
                <div className="flex flex-col gap-0.5">
                   <div className="flex items-center justify-between px-1">
                      <label className={`text-[7px] font-black uppercase tracking-[0.1em] opacity-40 ${isDarkMode ? 'text-slate-300' : 'text-slate-800'}`}>SCALE</label>
                      {renderInfoToggle("size")}
                   </div>
                   <MotionSelect 
                      value={aiScale} isDarkMode={isDarkMode} 
                      onChange={setAiScale} 
                      options={[
                        { value: "2", label: "2X" },
                        { value: "4", label: "4X" },
                        { value: "8", label: "8X" }
                      ]} 
                   />
                </div>
             </div>
             
             {/* Dynamic Info Row */}
             {activeInfo && (
                <div className="px-1 -mt-0.5 mb-1">
                   {renderInfoCard(activeInfo)}
                </div>
             )}

             <div className="grid grid-cols-2 gap-1.5">
                <div className="relative group/tip">
                   <ToggleItem active={faceRestore} label="FACE" onClick={() => setFaceRestore(!faceRestore)} isDarkMode={isDarkMode} icon="user" />
                   <div className="absolute top-1 right-1">{renderInfoToggle("faces")}</div>
                </div>
                <div className="relative group/tip">
                   <ToggleItem active={hyperDetail} label="DETAIL" onClick={() => setHyperDetail(!hyperDetail)} isDarkMode={isDarkMode} icon="zap" />
                   <div className="absolute top-1 right-1">{renderInfoToggle("sharp")}</div>
                </div>
                <div className="relative group/tip">
                   <ToggleItem active={denoise} label="DENOISE" onClick={() => setDenoise(!denoise)} isDarkMode={isDarkMode} icon="layers" />
                   <div className="absolute top-1 right-1">{renderInfoToggle("grain")}</div>
                </div>
                {hasVideos && (
                   <div className="relative group/tip">
                      <ToggleItem active={stabilize} label="STABLE" onClick={() => setStabilize(!stabilize)} isDarkMode={isDarkMode} icon="wind" />
                      <div className="absolute top-1 right-1">{renderInfoToggle("shake")}</div>
                   </div>
                )}
             </div>
          </div>
        )}

        {/* Row 3: Action Anchor */}
        <div className="mt-0">
           {renderActionButton()}
        </div>
      </div>
    </motion.div>
  );
});

SettingsDeck.displayName = "SettingsDeck";

export default SettingsDeck;
