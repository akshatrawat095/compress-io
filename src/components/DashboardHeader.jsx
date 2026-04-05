import React from "react";
import { motion } from "framer-motion";
import Icon from "./Icon";
import Magnetic from "./Magnetic";

const DashboardHeader = React.memo(({ 
  appMode, 
  isDarkMode, 
  setIsDarkMode, 
  isProcessing 
}) => {
  return (
    <header className="w-full flex flex-col gap-6">
      <div className="w-full flex justify-between items-center px-1">
         <div className="flex items-center gap-3 group">
            <div className="p-2.5 bg-gradient-to-br from-studio-violet to-studio-rose rounded-xl shadow-lg ring-1 ring-white/20 group-hover:scale-105 transition-all duration-500">
               <Icon name={appMode === 'compress' ? 'zap' : 'sparkles'} className="w-5 h-5 text-white" />
            </div>
            <h1 className={`text-xl font-black tracking-tighter uppercase font-display studio-text-glow transition-colors ${isDarkMode ? 'text-slate-100' : 'text-slate-900'}`}>
               {appMode === 'compress' ? 'Compress' : 'Enhance'} <span className="text-studio-violet">I/O</span>
            </h1>
         </div>
         
         <div className="flex items-center gap-2">
            <Magnetic>
              <motion.button
                whileHover={{ scale: 1.1, rotate: 5 }}
                whileTap={{ scale: 0.9, rotate: -5 }}
                onClick={() => setIsDarkMode(!isDarkMode)}
                className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all border ${
                  isDarkMode 
                  ? 'bg-studio-violet/10 border-studio-violet/30 text-studio-violet hover:bg-studio-violet/20 shadow-[0_0_15px_rgba(139,92,246,0.1)]' 
                  : 'bg-amber-50/50 border-amber-200 text-amber-600 hover:bg-amber-100 hover:border-amber-400 shadow-sm'
                }`}
              >
                 <Icon key={isDarkMode ? 'moon' : 'sun'} name={isDarkMode ? 'moon' : 'sun'} className="w-4 h-4" stroke={isDarkMode ? 2 : 2.5} />
              </motion.button>
            </Magnetic>
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border shadow-inner transition-all ${isDarkMode ? 'bg-studio-obsidian/60 border-white/5' : 'bg-slate-100 border-slate-200'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isProcessing ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.4)]'}`}></span>
              <span className={`text-[9px] font-black uppercase tracking-widest ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
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
