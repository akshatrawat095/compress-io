import React from "react";
import { motion } from "framer-motion";
import Icon from "./Icon";
import Magnetic from "./Magnetic";

const DashboardHeader = React.memo(({ 
  appMode, 
  isDarkMode, 
  setIsDarkMode, 
  isProcessing,
  updater
}) => {
  const showUpdaterPill = updater?.updateInfo && updater.status !== 'idle';
  return (
    <header className="w-full flex flex-col gap-6">
      <div className="w-full flex justify-between items-center px-1">
         <div className="flex items-center gap-3 group">
            <div className="p-2.5 bg-gradient-to-br from-studio-olive to-studio-forest rounded-xl shadow-[0_6px_18px_rgba(66,79,60,0.28)] ring-1 ring-white/25 group-hover:scale-105 transition-all duration-500">
               <Icon name={appMode === 'compress' ? 'compressLogo' : 'sparkles'} className="w-5 h-5 text-[#FAF9F5]" stroke={2.1} />
            </div>
            <h1 className={`text-xl font-black tracking-tighter uppercase font-display studio-text-glow transition-colors ${isDarkMode ? 'text-[#F2F0EB]' : 'text-[#222820]'}`}>
               {appMode === 'compress' ? 'Compress' : 'Enhance'} <span className={isDarkMode ? 'text-studio-sage' : 'text-studio-forest'}>I/O</span>
            </h1>
         </div>
         
         <div className="flex items-center gap-2">
            {showUpdaterPill && (
              <motion.button
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                onClick={updater.openModal}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border text-[9px] font-black uppercase tracking-widest transition-all ${
                  updater.status === 'ready'
                    ? (isDarkMode
                        ? 'bg-studio-sage/20 border-studio-sage/45 text-studio-moss shadow-[0_0_12px_rgba(138,162,130,0.25)]'
                        : 'bg-studio-forest border-studio-forest text-[#FAF9F5] shadow-sm')
                    : (isDarkMode
                        ? 'bg-white/5 border-white/15 text-studio-lichen hover:bg-white/10'
                        : 'bg-[#F5F1E6] border-[#DFD8C5] text-studio-forest hover:bg-[#EDE6D4]')
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${
                  updater.status === 'ready'
                    ? (isDarkMode ? 'bg-studio-moss animate-pulse' : 'bg-[#C8DEC0] animate-pulse')
                    : updater.status === 'error'
                      ? 'bg-[#B85442]'
                      : 'bg-studio-sage animate-pulse'
                }`} />
                {updater.status === 'ready'
                  ? `Update v${updater.updateInfo.version}`
                  : updater.status === 'downloading'
                    ? `v${updater.updateInfo.version} · ${updater.progress}%`
                    : updater.status === 'installing'
                      ? 'Restarting...'
                      : 'Update Retry'}
              </motion.button>
            )}
            <Magnetic>
              <motion.button
                whileHover={{ scale: 1.1, rotate: 5 }}
                whileTap={{ scale: 0.9, rotate: -5 }}
                onClick={() => setIsDarkMode(!isDarkMode)}
                className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all border ${
                  isDarkMode 
                  ? 'bg-studio-sage/15 border-studio-sage/30 text-studio-moss hover:bg-studio-sage/25 shadow-[0_0_15px_rgba(138,162,130,0.12)]' 
                  : 'bg-[#F5F1E6] border-[#DFD8C5] text-[#7D6838] hover:bg-[#EDE6D4] hover:border-[#C9BEA2] shadow-sm'
                }`}
              >
                 <Icon key={isDarkMode ? 'moon' : 'sun'} name={isDarkMode ? 'moon' : 'sun'} className="w-4 h-4" stroke={isDarkMode ? 2 : 2.5} />
              </motion.button>
            </Magnetic>
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border shadow-inner transition-all ${isDarkMode ? 'bg-studio-obsidian/70 border-[#8AA282]/15' : 'bg-[#EAE7DF] border-[#DCD8CD]'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isProcessing ? 'bg-[#C28D38] animate-pulse' : 'bg-studio-sage shadow-[0_0_8px_rgba(138,162,130,0.5)]'}`}></span>
              <span className={`text-[9px] font-black uppercase tracking-widest ${isDarkMode ? 'text-studio-lichen' : 'text-[#555C50]'}`}>
                {isProcessing ? "Processing" : "Idle"}
              </span>
            </div>
         </div>
      </div>
    </header>
  );
});

DashboardHeader.displayName = "DashboardHeader";

export default DashboardHeader;
