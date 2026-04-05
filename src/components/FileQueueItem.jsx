import React from "react";
import { motion, Reorder } from "framer-motion";
import Icon from "./Icon";

const FileQueueItem = React.memo(({ 
  file, 
  index, 
  isDarkMode, 
  isProcessing, 
  currentIndex, 
  progress, 
  onViewComparison, 
  onRemove 
}) => {
  const isActive = currentIndex === index;

  return (
    <Reorder.Item
      key={file.path}
      value={file}
      dragListener={!isProcessing}
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ 
        type: "spring", 
        stiffness: 400, 
        damping: 30,
        delay: index * 0.03
      }}
      className={`relative flex items-center p-2.5 rounded-xl border transition-all duration-300 ${
        isActive 
        ? (isDarkMode ? 'bg-studio-violet/10 border-studio-violet/40 shadow-studio-sm' : 'bg-studio-violet/5 border-studio-violet/30 shadow-sm') 
        : (isDarkMode ? 'bg-studio-obsidian/40 border-white/5 hover:border-white/10' : 'bg-white border-slate-100 hover:border-slate-200 shadow-sm')
      }`}
    >
      <div className={`w-9 h-9 rounded-lg mr-3 flex items-center justify-center transition-colors ${
        isDarkMode ? 'bg-white/5 text-slate-400' : 'bg-slate-50 text-slate-400 border border-slate-100'
      }`}>
        <Icon name={file.type === 'VID' ? 'film' : 'image'} className="w-5 h-5" />
      </div>
      
      <div className="flex-1 min-w-0">
         <p className={`text-[12px] font-bold truncate ${isDarkMode ? 'text-slate-100' : 'text-slate-800'}`}>{file.name}</p>
         <div className="flex items-center gap-2 mt-0.5">
             {file.status === 'done' && (
                <span className="text-[9px] font-black uppercase tracking-widest text-emerald-500 flex items-center gap-1.5 animate-in fade-in slide-in-from-left-1">
                  <Icon name="check" className="w-3 h-3" stroke={3} /> Ready
                </span>
             )}
             {file.status === 'processing' && (
                <span className="text-[9px] font-black uppercase tracking-widest text-studio-violet flex items-center gap-1.5 animate-pulse">
                  <div className="w-1.5 h-1.5 rounded-full bg-studio-violet shadow-[0_0_8px_rgba(139,92,246,0.4)]" /> {Math.round(progress)}%
                </span>
             )}
             {file.status === 'error' && (
                <span className="text-[9px] font-black uppercase tracking-widest text-rose-500 flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-rose-500" /> Retry
                </span>
             )}
             {file.status === 'queued' && (
                <span className={`text-[9px] font-black uppercase tracking-widest ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>Queued</span>
             )}
         </div>
      </div>

      {!isProcessing && (
         <button 
           onClick={() => onRemove(index)} 
           className="ml-3 w-8 h-8 flex items-center justify-center text-slate-400 hover:text-rose-500 transition-colors"
         >
           <Icon name="x" className="w-4 h-4" stroke={2.5} />
         </button>
      )}
    </Reorder.Item>
  );
});

FileQueueItem.displayName = "FileQueueItem";

export default FileQueueItem;
